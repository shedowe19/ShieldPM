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
import hashlib, json, os, platform, sys
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
    if ':' in args[1]:
        assert args[1].endswith('-0:/data/logs/ip_firewall_ci.log')
        Path(args[2]).write_text('CI retained firewall log marker\\nCI service UID 0 append probe\\n')
        sys.exit(0)
    fixture = Path(args[1])
    marker = fixture / 'tls/certbot/accounts/acme-v02.api.letsencrypt.org/directory/ci-offline/marker'
    assert marker.is_file() and (fixture / '.env').is_file()
    assert (fixture / 'grpc-smoke.mjs').is_file()
    assert (fixture / 'ip-firewall-smoke.mjs').is_file()
    assert (fixture / 'nginx-smoke-modules.mjs').is_file()
    assert (fixture / 'nginx-smoke-endpoints.mjs').is_file()
    assert (fixture / 'mmdb-oracle.py').is_file()
    retained_log = (fixture / 'logs/ip_firewall_ci.log').read_text()
    assert retained_log.splitlines()[0] == 'CI retained firewall log marker'
    if args[2].endswith('-1000:/data/'):
        assert 'CI service UID 0 append probe' in retained_log.splitlines()
    country_database = fixture / 'GeoIP2-Country-Test.mmdb'
    assert hashlib.sha256(country_database.read_bytes()).hexdigest() == 'b37601903448683d241af52893c8cbf0fed461e0cdebe0bfaca01891fdeb6db9'
    asn_database = fixture / 'GeoLite2-ASN-Test.mmdb'
    assert hashlib.sha256(asn_database.read_bytes()).hexdigest() == '75901b98ed6e58d3bd41af9985044b747a7ec0be1369f930c24f5e044427181a'
    assert (fixture / 'nginx/GeoLite2-ASN.mmdb').read_bytes() == asn_database.read_bytes()
    assert (fixture / 'nginx/GeoLite2-Country.mmdb').read_bytes() == country_database.read_bytes()
    assert hashlib.sha256((fixture / 'nginx/GeoLite2-City.mmdb').read_bytes()).hexdigest() == 'ed972738e4e03a3e56e12041a6af4d91592249d110f7e4a647e5f2fa0e639c09'
elif args[0] == 'exec' and mode == 'write-failure':
    print('Permission denied: simulated runtime write', file=sys.stderr)
    sys.exit(42)
elif args[0] == 'exec' and mode == 'grpc-failure':
    assert any('node /data/grpc-smoke.mjs' in arg for arg in args)
    print('gRPC route /default/ failed', file=sys.stderr)
    sys.exit(43)
elif args[0] == 'exec' and mode == 'firewall-failure':
    assert any('node /data/ip-firewall-smoke.mjs' in arg for arg in args)
    print('IP firewall HTTP403 check failed', file=sys.stderr)
    sys.exit(44)
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
            for value in (f"PUID={uid}", f"PGID={uid}", "TZ=UTC", "DISABLE_IPV6=true", "SKIP_IP_RANGES=true", "GEOIP_AUTO_UPDATE=false", "NGINX_LOAD_GEOIP2_MODULE=true"):
                self.assertIn(value, call)
        executions = [call for call in calls if call[0] == "exec"]
        self.assertEqual([call[call.index("--user") + 1] for call in executions], ["0:0", "1000:1000"])
        for call in executions:
            self.assertTrue(any("NGINX_GEOIP_DATABASE=/data/GeoIP2-Country-Test.mmdb" in arg for arg in call))
            self.assertTrue(any("NGINX_ASN_DATABASE=/data/GeoLite2-ASN-Test.mmdb" in arg and "NGINX_REQUIRE_ASN_STARTUP=true" in arg for arg in call))
            self.assertTrue(any("NGINX_SMOKE_DISCOVER_MODULES=true" in arg and "NGINX_REQUIRE_MODSECURITY=true" in arg for arg in call))
            self.assertFalse(any("NGINX_MODSECURITY_STATIC=true" in arg for arg in call))
            self.assertTrue(any("CI retained firewall log marker" in arg and "CI service UID $1 append probe" in arg for arg in call))
            self.assertTrue(any('stat -c %u /data/logs' in arg and 'stat -c %a /data/logs' in arg for arg in call))
        transfers = [call for call in calls if call[0] == "cp" and ":" in call[1]]
        self.assertEqual(len(transfers), 1)
        self.assertTrue(transfers[0][1].endswith("-0:/data/logs/ip_firewall_ci.log"))
        self.assertTrue(transfers[0][2].endswith("/logs/ip_firewall_ci.log"))
        self.assert_cleaned(calls, 2)

    def test_log_probe_preserves_uid_0_append_when_uid_1000_runs(self):
        source = SCRIPT.read_text()
        probe = source.split('        test "$(head -n 1 /data/logs/ip_firewall_ci.log)"', 1)[1]
        probe = 'test "$(head -n 1 /data/logs/ip_firewall_ci.log)"' + probe.split('        : > /data/logs/.ci-write-probe', 1)[0]
        data = self.root / "data"
        logs = data / "logs"
        logs.mkdir(parents=True)
        log = logs / "ip_firewall_ci.log"
        log.write_text("CI retained firewall log marker\n")
        probe = probe.replace("/data", str(data))
        for uid in (0, 1000):
            result = subprocess.run(["sh", "-ceu", probe, "smoke", str(uid)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(log.read_text().splitlines(), [
            "CI retained firewall log marker", "CI service UID 0 append probe", "CI service UID 1000 append probe",
        ])
        log.write_text("CI retained firewall log marker\n")
        missing_history = subprocess.run(["sh", "-ceu", probe, "smoke", "1000"], capture_output=True, text=True)
        self.assertNotEqual(missing_history.returncode, 0)
        self.assertNotIn("CI service UID 1000 append probe", log.read_text())

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

    def test_firewall_request_failure_fails_the_gate_and_cleans_up(self):
        result, calls = self.run_smoke("firewall-failure")
        self.assertEqual(result.returncode, 44)
        self.assertIn("IP firewall HTTP403 check failed", result.stderr)
        self.assertIn("diagnostic container logs", result.stderr)
        self.assert_cleaned(calls, 1)


if __name__ == "__main__":
    unittest.main()
