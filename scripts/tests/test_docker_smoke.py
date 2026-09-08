"""Exercise CI smoke orchestration and cleanup without a Docker daemon."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "ci/docker-smoke.sh"


class DockerSmokeTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.calls = self.root / "calls.jsonl"
        docker = self.root / "docker"
        docker.write_text("""#!/usr/bin/env python3
import json, os, platform, sys
from pathlib import Path
args = sys.argv[1:]
with open(os.environ['DOCKER_CALLS'], 'a') as output:
    output.write(json.dumps(args) + '\\n')
mode = os.environ['DOCKER_MODE']
if args[:2] == ['image', 'inspect']:
    print('arm64' if platform.machine() == 'aarch64' else 'amd64')
elif args[0] == 'inspect':
    if '{{json .State}}' in args:
        print('diagnostic state')
    else:
        print('true healthy' if mode != 'unhealthy' else 'true unhealthy')
elif args[0] == 'cp':
    fixture = Path(args[1])
    marker = fixture / 'tls/certbot/accounts/acme-v02.api.letsencrypt.org/directory/ci-offline/marker'
    assert marker.is_file() and (fixture / '.env').is_file()
    assert (fixture / 'grpc-smoke.mjs').is_file()
elif args[0] == 'exec' and mode == 'write-failure':
    print('Permission denied: simulated runtime write', file=sys.stderr)
    sys.exit(42)
elif args[0] == 'exec' and mode == 'grpc-failure':
    assert any('node /data/grpc-smoke.mjs' in arg for arg in args)
    print('gRPC route /default/ failed', file=sys.stderr)
    sys.exit(43)
elif args[0] == 'logs':
    print('diagnostic container logs')
""")
        docker.chmod(0o700)

    def run_smoke(self, mode):
        result = subprocess.run(
            ["bash", str(SCRIPT), "shieldpm:ci-fixture"],
            env={**os.environ, "PATH": f"{self.root}:{os.environ['PATH']}",
                 "DOCKER_CALLS": str(self.calls), "DOCKER_MODE": mode,
                 "SMOKE_HEALTH_TIMEOUT_SECONDS": "1"},
            capture_output=True, text=True, timeout=10,
        )
        calls = [json.loads(line) for line in self.calls.read_text().splitlines()]
        return result, calls

    def assert_cleaned(self, calls, count):
        self.assertEqual(len([call for call in calls if call[0] == "rm"]), count)
        self.assertEqual(len([call for call in calls if call[:2] == ["volume", "rm"]]), count)
        for call in calls:
            if call[0] == "cp":
                self.assertFalse(Path(call[1]).exists())

    def test_success_runs_both_service_users_offline_and_removes_all_resources(self):
        result, calls = self.run_smoke("healthy")
        self.assertEqual(result.returncode, 0, result.stderr)
        creates = [call for call in calls if call[0] == "create"]
        self.assertEqual(len(creates), 2)
        for uid, call in zip((0, 1000), creates):
            self.assertEqual(call[call.index("--network") + 1], "none")
            self.assertEqual(call[call.index("--pull") + 1], "never")
            for value in (f"PUID={uid}", f"PGID={uid}", "TZ=UTC", "DISABLE_IPV6=true", "SKIP_IP_RANGES=true"):
                self.assertIn(value, call)
        executions = [call for call in calls if call[0] == "exec"]
        self.assertEqual([call[call.index("--user") + 1] for call in executions], ["0:0", "1000:1000"])
        self.assert_cleaned(calls, 2)

    def test_unhealthy_container_times_out_with_diagnostics_and_cleanup(self):
        result, calls = self.run_smoke("unhealthy")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Healthcheck timed out", result.stderr)
        self.assertIn("diagnostic container logs", result.stderr)
        self.assertFalse(any(call[0] == "exec" for call in calls))
        self.assert_cleaned(calls, 1)

    def test_runtime_write_failure_fails_the_gate_and_cleans_up(self):
        result, calls = self.run_smoke("write-failure")
        self.assertEqual(result.returncode, 42)
        self.assertIn("Permission denied", result.stderr)
        self.assertIn("diagnostic container logs", result.stderr)
        self.assert_cleaned(calls, 1)

    def test_grpc_request_failure_fails_the_gate_and_cleans_up(self):
        result, calls = self.run_smoke("grpc-failure")
        self.assertEqual(result.returncode, 43)
        self.assertIn("gRPC route /default/ failed", result.stderr)
        self.assertIn("diagnostic container logs", result.stderr)
        self.assert_cleaned(calls, 1)


if __name__ == "__main__":
    unittest.main()
