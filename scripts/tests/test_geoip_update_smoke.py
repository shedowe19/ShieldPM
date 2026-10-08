"""Exercise online GeoIP smoke orchestration without Docker or provider requests."""

import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
import unittest


REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "scripts/ci/geoip-update-smoke.sh"
FIRST_MARKER = "GeoIP bootstrap smoke: first boot verified all 3 runtime databases"
SECOND_MARKER = "GeoIP bootstrap smoke: second boot retained all 3 database inodes and hashes"


class GeoipUpdateSmokeTests(unittest.TestCase):
    def setUp(self):
        if platform.machine() not in ("x86_64", "aarch64"):
            self.skipTest("The online smoke supports native AMD64 and ARM64 runners")
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.calls = self.root / "calls.jsonl"
        self.smoke_temporaries = self.root / "smoke-temporaries"
        self.smoke_temporaries.mkdir()
        docker = self.root / "docker"
        docker.write_text(f"#!{sys.executable}\n" + '''import json, os, platform, sys
args = sys.argv[1:]
with open(os.environ['DOCKER_CALLS'], 'a') as output:
    output.write(json.dumps(args) + '\\n')
mode = os.environ['DOCKER_MODE']
if args[:2] == ['image', 'inspect']:
    arch = 'arm64' if platform.machine() == 'aarch64' else 'amd64'
    print(('amd64' if arch == 'arm64' else 'arm64') if mode == 'wrong-architecture' else arch)
elif args[:2] == ['volume', 'create']:
    print(args[-1])
elif args[0] == 'create':
    print(args[args.index('--name') + 1])
elif args[0] == 'start':
    boot = int(args[-1].rsplit('-', 1)[1])
    if mode == 'attach-failure' and boot == 1:
        print('Simulated Docker attach failure', file=sys.stderr)
        sys.exit(43)
    if mode == 'cached-provider-failure' and boot == 2:
        print('[GeoIP] WARNING: GitHub download returned HTTP 403; using the complete validated cached databases')
        sys.exit(0)
    counts = '3 updated, 0 unchanged' if boot == 1 else '0 updated, 3 unchanged'
    if (mode == 'wrong-first-counts' and boot == 1) or (mode == 'wrong-second-counts' and boot == 2):
        counts = '2 updated, 1 unchanged'
    if mode == 'changed-snapshot' and boot == 2:
        counts = '1 updated, 2 unchanged'
        print('[GeoIP] Downloading GeoLite2-City.mmdb (fixture bytes)')
    if mode == 'unchanged-redownload' and boot == 2:
        print('[GeoIP] Downloading GeoLite2-City.mmdb (fixture bytes)')
    release = 'fixture-next' if mode == 'changed-snapshot' and boot == 2 else 'fixture'
    print('[GeoIP] Release ' + release + ' ready; ' + counts)
    if boot == 1 and mode != 'missing-first-marker':
        print('GeoIP bootstrap smoke: first boot verified all 3 runtime databases')
    if boot == 2 and mode != 'missing-retention-marker':
        if mode == 'changed-snapshot':
            print('GeoIP bootstrap smoke: second boot advanced latest snapshot; 1 updated, 2 unchanged')
        else:
            print('GeoIP bootstrap smoke: second boot retained all 3 database inodes and hashes')
elif args[0] == 'inspect':
    assert args[args.index('--format') + 1] == '{{.State.ExitCode}}'
    boot = int(args[-1].rsplit('-', 1)[1])
    failed = (mode == 'first-failure' and boot == 1) or (mode == 'second-failure' and boot == 2)
    # An attached Docker CLI may return success even after the container fails.
    # Keep both output markers valid so only the explicit exit-code gate can
    # reject this case, rather than accidentally relying on missing log lines.
    print(42 if failed else 0)
elif args[0] == 'logs':
    print('GeoIP provider diagnostic logs for ' + args[-1])
elif args[0] == 'rm' and mode == 'cleanup-failure':
    print('Simulated Docker cleanup failure', file=sys.stderr)
    sys.exit(7)
''')
        docker.chmod(0o700)

    def run_smoke(self, mode, token=""):
        result = subprocess.run(
            ["bash", str(SCRIPT), "shieldpm:geoip-ci-fixture"],
            env={**os.environ, "PATH": f"{self.root}:{os.environ['PATH']}",
                 "GEOIP_GITHUB_TOKEN": token,
                 "TMPDIR": str(self.smoke_temporaries), "DOCKER_CALLS": str(self.calls), "DOCKER_MODE": mode},
            capture_output=True, text=True, timeout=10,
        )
        calls = [json.loads(line) for line in self.calls.read_text().splitlines()]
        return result, calls

    def assert_cleaned(self, calls, container_count):
        creates = [call for call in calls if call[0] == "create"]
        removes = [call for call in calls if call[0] == "rm"]
        self.assertEqual(len(creates), container_count)
        self.assertEqual(len(removes), container_count)
        self.assertEqual([call[-1] for call in removes],
                         [call[call.index("--name") + 1] for call in creates])
        self.assertTrue(all("--force" in call for call in removes))
        volume_creates = [call for call in calls if call[:2] == ["volume", "create"]]
        volume_removes = [call for call in calls if call[:2] == ["volume", "rm"]]
        self.assertEqual(len(volume_creates), 1)
        self.assertEqual(len(volume_removes), 1)
        self.assertEqual(volume_creates[0][-1], volume_removes[0][-1])
        self.assertGreater(calls.index(volume_removes[0]), max(calls.index(call) for call in removes))
        self.assertEqual(list(self.smoke_temporaries.iterdir()), [])

    def assert_failed_boot(self, mode, boot):
        result, calls = self.run_smoke(mode)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("Docker GeoIP bootstrap smoke passed", result.stdout)
        self.assertIn("GeoIP provider diagnostic logs", result.stderr)
        starts = [call for call in calls if call[0] == "start"]
        self.assertEqual(len(starts), boot)
        self.assertTrue(starts[-1][-1].endswith(f"-{boot}"))
        diagnostics = [call[-1] for call in calls if call[0] == "logs"]
        self.assertEqual(diagnostics, [call[-1] for call in starts])
        self.assert_cleaned(calls, boot)
        return result, calls

    def test_two_boots_use_one_volume_with_real_helper_entrypoint_and_clean_up(self):
        result, calls = self.run_smoke("success")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("[GeoIP] Release fixture ready; 3 updated, 0 unchanged", result.stdout)
        self.assertIn("[GeoIP] Release fixture ready; 0 updated, 3 unchanged", result.stdout)
        self.assertIn(FIRST_MARKER, result.stdout)
        self.assertIn(SECOND_MARKER, result.stdout)
        expected_arch = "arm64" if platform.machine() == "aarch64" else "amd64"
        self.assertIn(f"Docker GeoIP bootstrap smoke passed (2 boots, 3 databases, {expected_arch})", result.stdout)
        creates = [call for call in calls if call[0] == "create"]
        volume = next(call[-1] for call in calls if call[:2] == ["volume", "create"])
        for boot, call in enumerate(creates, 1):
            self.assertNotIn("--env", call)
            self.assertEqual(call[call.index("--network") + 1], "bridge")
            self.assertEqual(call[call.index("--pull") + 1], "never")
            self.assertEqual(call[call.index("--entrypoint") + 1], "bash")
            self.assertEqual(call[call.index("--mount") + 1], f"type=volume,source={volume},target=/data")
            self.assertEqual(call[-2:], ["smoke", str(boot)])
            self.assertIn("pipefail", call)
            bootstrap = call[call.index("-c") + 1]
            self.assertIn("python3 /usr/local/bin/update-geoip.py --directory /data/nginx", bootstrap)
            self.assertIn('"inode": stat.st_ino', bootstrap)
            self.assertIn('"mtime_ns": stat.st_mtime_ns', bootstrap)
            self.assertIn('hashlib.file_digest', bootstrap)
            self.assertIn('"sha256":', bootstrap)
            self.assertIn("assert current == previous[name]", bootstrap)
            self.assertIn("(updated, unchanged) == (changed, 3 - changed)", bootstrap)
            self.assertFalse(any("GEOIP_AUTO_UPDATE=false" in argument for argument in call))
            self.assertFalse(any("entrypoint.sh" in argument or "envs.sh" in argument for argument in call))
        starts = [call for call in calls if call[0] == "start"]
        inspections = [call for call in calls if call[0] == "inspect"]
        self.assertEqual([call[-1] for call in inspections], [call[-1] for call in starts])
        self.assertFalse(any(call[0] == "logs" for call in calls))
        self.assert_cleaned(calls, 2)

    def test_optional_metadata_token_is_forwarded_by_name_for_both_boots(self):
        token = "fixture_github_token"
        result, calls = self.run_smoke("success", token=token)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        creates = [call for call in calls if call[0] == "create"]
        self.assertEqual(len(creates), 2)
        for call in creates:
            self.assertEqual(call[call.index("--env") + 1], "GEOIP_GITHUB_TOKEN")
            self.assertNotIn(token, json.dumps(call))
        self.assertNotIn(token, result.stdout + result.stderr)
        self.assert_cleaned(calls, 2)

    def test_first_container_failure_is_rejected_even_with_success_log_markers(self):
        result, _ = self.assert_failed_boot("first-failure", 1)
        self.assertIn(FIRST_MARKER, result.stdout)
        self.assertIn("GeoIP bootstrap container failed (boot 1)", result.stderr)

    def test_second_container_failure_is_rejected_even_with_retention_log_marker(self):
        result, _ = self.assert_failed_boot("second-failure", 2)
        self.assertIn(SECOND_MARKER, result.stdout)
        self.assertIn("GeoIP bootstrap container failed (boot 2)", result.stderr)

    def test_attached_cli_failure_is_not_hidden_by_tee(self):
        result, _ = self.assert_failed_boot("attach-failure", 1)
        self.assertEqual(result.returncode, 43)
        self.assertIn("Simulated Docker attach failure", result.stdout)

    def test_cached_provider_failure_still_rejects_unchecked_latest_metadata(self):
        result, _ = self.assert_failed_boot("cached-provider-failure", 2)
        self.assertIn("GitHub download returned HTTP 403", result.stdout)
        self.assertNotIn(SECOND_MARKER, result.stdout)

    def test_incomplete_first_download_counts_stop_before_second_boot(self):
        self.assert_failed_boot("wrong-first-counts", 1)

    def test_changed_second_download_counts_reject_unchanged_release_claim(self):
        self.assert_failed_boot("wrong-second-counts", 2)

    def test_missing_first_runtime_inventory_marker_stops_before_second_boot(self):
        self.assert_failed_boot("missing-first-marker", 1)

    def test_missing_second_retention_marker_rejects_success(self):
        self.assert_failed_boot("missing-retention-marker", 2)

    def test_legitimate_latest_content_change_accepts_matching_updated_snapshot(self):
        result, calls = self.run_smoke("changed-snapshot")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("[GeoIP] Release fixture-next ready; 1 updated, 2 unchanged", result.stdout)
        self.assertIn("second boot advanced latest snapshot; 1 updated, 2 unchanged", result.stdout)
        self.assertIn("Docker GeoIP bootstrap smoke passed", result.stdout)
        self.assertEqual(len([call for call in calls if call[0] == "start"]), 2)
        self.assert_cleaned(calls, 2)

    def test_unchanged_release_download_line_rejects_success_despite_retention_marker(self):
        result, _ = self.assert_failed_boot("unchanged-redownload", 2)
        self.assertIn(SECOND_MARKER, result.stdout)
        self.assertIn("Unchanged GeoIP snapshot was downloaded again", result.stderr)

    def test_cleanup_failure_fails_gate_but_still_attempts_every_owned_resource(self):
        result, calls = self.run_smoke("cleanup-failure")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Simulated Docker cleanup failure", result.stderr)
        self.assert_cleaned(calls, 2)

    def test_architecture_mismatch_stops_before_creating_any_resources(self):
        result, calls = self.run_smoke("wrong-architecture")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("requires the runner's native architecture", result.stderr)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][:2], ["image", "inspect"])
        self.assertEqual(list(self.smoke_temporaries.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
