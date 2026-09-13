"""Run the updater's real preflight with isolated files and download fixtures."""

import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[2]
UPDATER = REPO / "rootfs/usr/local/bin/update-shieldpm"
SHA = "1234567890abcdef1234567890abcdef12345678"


class UpdatePreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "run").mkdir()
        (self.root / "app").mkdir()
        (self.root / "app/package.json").write_text('{"version":"4.3.2"}')
        self.response = self.root / "response.json"
        self.response.write_text(json.dumps({"sha": SHA}))
        self.installed = self.root / "installed-updater"
        self.installed.write_text("#!/bin/bash\n# previous updater\n")
        self.download = self.root / "downloaded-updater"
        self.download.write_text("#!/bin/bash\n# target branch updater\n")

    def run_preflight(self, *, api_status=0, already_updated=False):
        source = UPDATER.read_text()
        preflight = source[source.index('REPO_URL='):source.index('enable_node_system_ca()')]
        preflight = preflight.replace('/app', str(self.root / "app"))
        preflight = preflight.replace('"/usr/local/bin/update-shieldpm"', shlex.quote(str(self.installed)))
        harness = r'''
set -euo pipefail
UPDATE_RUN_DIR="$FIXTURE_ROOT/run"
curl() {
    local output="" url=""
    while [ "$#" -gt 0 ]; do
        case "$1" in
            -o) output="$2"; shift 2 ;;
            --connect-timeout|--max-time) shift 2 ;;
            https://*) url="$1"; shift ;;
            *) shift ;;
        esac
    done
    printf '%s\n' "$url" >> "$FIXTURE_ROOT/requests"
    if [[ "$url" == https://api.github.com/* ]]; then
        cat "$FIXTURE_ROOT/response.json"
        return "$API_STATUS"
    fi
    cp "$FIXTURE_ROOT/downloaded-updater" "$output"
}
exec() {
    printf '%s\n' "$SHIELDPM_SELF_UPDATED" "$@" > "$FIXTURE_ROOT/restart"
    exit 0
}
'''
        return subprocess.run(
            ["bash", "-c", harness + preflight + '\necho PREFLIGHT_COMPLETE\n',
             "preflight", "-b", "codex/comprehensive-code-audit"],
            input="y", text=True, capture_output=True, timeout=15,
            env={**os.environ, "FIXTURE_ROOT": str(self.root), "API_STATUS": str(api_status),
                 "SHIELDPM_SELF_UPDATED": "1" if already_updated else "0"},
        )

    def test_self_update_uses_resolved_target_commit_and_preserves_arguments(self):
        result = self.run_preflight()
        self.assertEqual(result.returncode, 0, result.stderr)
        requests = (self.root / "requests").read_text().splitlines()
        self.assertEqual(requests, [
            "https://api.github.com/repos/shedowe19/ShieldPM/commits/codex%2Fcomprehensive-code-audit",
            f"https://raw.githubusercontent.com/shedowe19/ShieldPM/{SHA}/rootfs/usr/local/bin/update-shieldpm",
        ])
        self.assertEqual(self.installed.read_text(), self.download.read_text())
        self.assertEqual((self.root / "restart").read_text().splitlines(),
                         ["1", "/bin/bash", str(self.installed), "-b", "codex/comprehensive-code-audit"])

    def test_http_failure_is_reported_before_self_update(self):
        # Even a valid-looking body must not hide curl's nonzero exit status.
        result = self.run_preflight(api_status=22)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Could not resolve branch", result.stdout + result.stderr)
        self.assertIn("No application files were changed", result.stdout + result.stderr)
        self.assertNotIn("PREFLIGHT_COMPLETE", result.stdout)
        self.assertEqual(len((self.root / "requests").read_text().splitlines()), 1)
        self.assertIn("previous updater", self.installed.read_text())

    def test_invalid_json_is_reported_before_self_update(self):
        self.response.write_text("<html>unavailable</html>")
        result = self.run_preflight()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Could not resolve branch", result.stdout + result.stderr)
        self.assertFalse((self.root / "restart").exists())

    def test_api_error_and_invalid_sha_do_not_start_an_update(self):
        for response in [{"message": "API rate limit exceeded"}, {"sha": "not-a-commit"}]:
            with self.subTest(response=response):
                self.response.write_text(json.dumps(response))
                result = self.run_preflight()
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Could not resolve branch", result.stdout + result.stderr)
                self.assertFalse((self.root / "restart").exists())

    def test_large_response_is_fully_consumed_without_sigpipe(self):
        self.response.write_text(json.dumps({"sha": SHA, "files": [{"sha": "f" * 40}] * 20000}, indent=2))
        result = self.run_preflight(already_updated=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Latest Commit:   1234567", result.stdout)
        self.assertIn("PREFLIGHT_COMPLETE", result.stdout)
        self.assertEqual(len((self.root / "requests").read_text().splitlines()), 1)

    def test_missing_display_version_does_not_abort_the_update(self):
        (self.root / "app/package.json").write_text('{"name":"shieldpm"}')
        result = self.run_preflight(already_updated=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Current Version: unknown", result.stdout)
        self.assertIn("PREFLIGHT_COMPLETE", result.stdout)


if __name__ == "__main__":
    unittest.main()
