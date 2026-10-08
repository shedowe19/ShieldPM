"""Check that dependency automation leaves an existing review untouched."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "scripts/ci/dependency-update-guard.sh"


class DependencyUpdateGuardTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.calls = self.root / "calls.jsonl"
        self.output = self.root / "output"
        gh = self.root / "gh"
        gh.write_text(f"#!{sys.executable}\n" + '''import json, os, sys
with open(os.environ['GH_CALLS'], 'a') as output:
    output.write(json.dumps(sys.argv[1:]) + '\\n')
if os.environ['GH_RESPONSE'] == 'api-error':
    print('Simulated API authorization failure', file=sys.stderr)
    sys.exit(1)
print(os.environ['GH_RESPONSE'])
''')
        gh.chmod(0o700)

    def run_guard(self, response):
        result = subprocess.run(
            ["bash", str(SCRIPT)],
            env={**os.environ, "PATH": f"{self.root}:{os.environ['PATH']}",
                 "GITHUB_REPOSITORY": "shedowe19/ShieldPM", "GITHUB_OUTPUT": str(self.output),
                 "GH_CALLS": str(self.calls), "GH_RESPONSE": response},
            capture_output=True, text=True, timeout=10,
        )
        output = self.output.read_text() if self.output.exists() else ""
        calls = [json.loads(line) for line in self.calls.read_text().splitlines()]
        self.assertEqual(calls, [["pr", "list", "--repo", "shedowe19/ShieldPM", "--state", "open",
                                  "--head", "update-all-deps", "--limit", "1", "--json", "number",
                                  "--jq", "length"]])
        return result, output

    def test_existing_open_pr_skips_updates_without_mutating_github(self):
        result, output = self.run_guard("1")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(output, "can_update=false\n")
        self.assertIn("preserving its branch and description", result.stdout)

    def test_no_open_pr_allows_normal_dependency_update(self):
        result, output = self.run_guard("0")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(output, "can_update=true\n")

    def test_api_failure_never_grants_permission_to_replace_a_proposal(self):
        result, output = self.run_guard("api-error")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(output, "")
        self.assertIn("API authorization failure", result.stderr)

    def test_invalid_api_result_never_grants_permission_to_update(self):
        for response in ("", "null", "[150]", "0\n1", "unexpected"):
            with self.subTest(response=response):
                self.calls.unlink(missing_ok=True)
                result, output = self.run_guard(response)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(output, "")
                self.assertIn("Could not validate", result.stdout)


if __name__ == "__main__":
    unittest.main()
