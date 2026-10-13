"""Execute the Dockerfile lint gate with isolated linter and file fixtures."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "scripts/ci/dockerlint.sh"


class DockerlintTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.calls = self.root / "calls.jsonl"
        hadolint = self.bin / "hadolint"
        hadolint.write_text(f"#!{sys.executable}\n" + '''import json, os, sys
from pathlib import Path
args = sys.argv[1:]
with open(os.environ['HADOLINT_CALLS'], 'a') as output:
    output.write(json.dumps(args) + '\\n')
mode = Path(args[0]).read_text().strip()
if mode == 'crash':
    print('Simulated linter execution failure', file=sys.stderr)
    sys.exit(42)
if mode == 'rule':
    print(args[0] + ':2 DL4000 fixture rule')
    sys.exit(1)
if mode == 'zero-status-rule':
    print(args[0] + ':2 SC1000 fixture rule')
''')
        hadolint.chmod(0o700)

    def dockerfile(self, name="Dockerfile", mode="success"):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(mode)

    def run_gate(self):
        result = subprocess.run(
            ["bash", str(SCRIPT)], cwd=self.root,
            env={"PATH": f"{self.bin}:{os.environ['PATH']}", "HADOLINT_CALLS": str(self.calls)},
            capture_output=True, text=True, timeout=10,
        )
        calls = [json.loads(line) for line in self.calls.read_text().splitlines()] if self.calls.exists() else []
        return result, calls

    def test_success_checks_every_dockerfile_with_existing_ignore_rules(self):
        self.dockerfile()
        self.dockerfile("nested with spaces/custom Dockerfile.test")
        self.dockerfile("newline\nDockerfile")
        self.dockerfile("ordinary.txt", mode="crash")
        result, calls = self.run_gate()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual({call[0] for call in calls},
                         {"./Dockerfile", "./nested with spaces/custom Dockerfile.test", "./newline\nDockerfile"})
        for call in calls:
            self.assertEqual(call[1:], ["--ignore", "DL3003", "--ignore", "DL3007",
                                        "--ignore", "DL3013", "--ignore", "DL3008"])

    def test_linter_crash_fails_even_without_a_rule_code_and_keeps_stderr(self):
        self.dockerfile(mode="crash")
        result, _ = self.run_gate()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Simulated linter execution failure", result.stdout)
        self.assertIn("Simulated linter execution failure", (self.root / "hadolint.log").read_text())
        self.assertIn("Dockerfile lint failed", result.stderr)

    def test_failure_does_not_skip_remaining_dockerfiles(self):
        self.dockerfile("first/Dockerfile", mode="crash")
        self.dockerfile("second/Dockerfile", mode="rule")
        self.dockerfile("third/Dockerfile")
        result, calls = self.run_gate()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual({call[0] for call in calls},
                         {"./first/Dockerfile", "./second/Dockerfile", "./third/Dockerfile"})
        log = (self.root / "hadolint.log").read_text()
        self.assertIn("Simulated linter execution failure", log)
        self.assertIn("DL4000", log)

    def test_rule_diagnostic_still_fails_when_tool_returns_zero(self):
        self.dockerfile(mode="zero-status-rule")
        result, _ = self.run_gate()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SC1000", result.stdout)

    def test_previous_run_log_is_cleared_before_successful_run(self):
        self.dockerfile()
        (self.root / "hadolint.log").write_text("DL4000 from an old run\n")
        result, _ = self.run_gate()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.root / "hadolint.log").read_text(), "")

    def test_no_dockerfiles_fails_instead_of_reporting_an_empty_gate(self):
        result, calls = self.run_gate()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("No Dockerfiles found", result.stderr)
        self.assertEqual(calls, [])

    def test_file_discovery_failure_is_fatal_before_linting(self):
        self.dockerfile()
        finder = self.bin / "find"
        finder.write_text("#!/bin/sh\nprintf './Dockerfile\\0'\necho discovery-failed >&2\nexit 23\n")
        finder.chmod(0o700)
        result, calls = self.run_gate()
        self.assertEqual(result.returncode, 23)
        self.assertIn("discovery-failed", result.stderr)
        self.assertEqual(calls, [])

    def test_log_writer_failure_is_fatal_even_when_linter_succeeds(self):
        self.dockerfile()
        writer = self.bin / "tee"
        writer.write_text("#!/bin/sh\ncat >/dev/null\necho log-write-failed >&2\nexit 24\n")
        writer.chmod(0o700)
        result, calls = self.run_gate()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("log-write-failed", result.stderr)
        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
