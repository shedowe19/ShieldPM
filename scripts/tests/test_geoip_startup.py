"""Run the real startup environment script with isolated GeoIP and service fixtures.

Only deployment paths are redirected. The validator and migration handoff are
real; downloads, the fingerprint, root identity, and service startup are stubs.
No network, Docker daemon, systemd service, or host configuration is touched.
"""

import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest


REPO = Path(__file__).resolve().parents[2]
RUNTIME = REPO / "rootfs/usr/local/bin"
FIXTURES = REPO / "scripts/ci/fixtures"
DATABASES = {
    "Country": "GeoIP2-Country-Test.mmdb",
    "City": "GeoIP2-City-Test.mmdb",
    "ASN": "GeoLite2-ASN-Test.mmdb",
}


class GeoipStartupTests(unittest.TestCase):
    def setUp(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is required for the real startup validator")
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.data = self.root / "data"
        self.app = self.root / "app"
        self.bin = self.root / "bin"
        for directory in (self.data, self.app / "lib", self.bin):
            directory.mkdir(parents=True, exist_ok=True)
        self.trace = self.root / "trace.jsonl"
        self.launched = self.root / "launched.jsonl"
        self.env_file = self.data / ".env"
        self.env_file.write_text("GOA=true\n")
        (self.app / "package.json").write_text('{"version":"startup-fixture"}')

        # The validator's real filesystem discovery sees exactly the databases
        # written by this fixture updater, with only its fixed /data redirected.
        validator = (REPO / "backend/validate-env.cjs").read_text()
        (self.app / "validate-env.cjs").write_text(
            validator.replace("/data/", f"{self.data}/"))
        source = (RUNTIME / "envs.sh").read_text()
        source = source.replace("/usr/local/bin/update-geoip.py", str(self.bin / "update-geoip.py"))
        source = source.replace("/data", str(self.data)).replace("/app", str(self.app))
        self.envs = self.root / "envs.sh"
        self.envs.write_text(source)

        updater = '''import argparse, json, os, shutil, sys
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('--directory', required=True)
args = parser.parse_args()
def trace(phase, **values):
    with open(os.environ['SHIELDPM_TEST_TRACE'], 'a') as output:
        output.write(json.dumps(dict(phase=phase, **values)) + '\\n')
setting = os.environ.get('GEOIP_AUTO_UPDATE', 'true')
trace('updater', setting=setting, module=os.environ.get('NGINX_LOAD_GEOIP2_MODULE'))
if setting == 'false':
    trace('updater_skipped')
    sys.exit(0)
if os.environ.get('SHIELDPM_TEST_UPDATER_FAILURE') == 'true':
    trace('updater_failed')
    sys.exit(23)
directory = Path(args.directory)
directory.mkdir(parents=True, exist_ok=True)
fixtures = Path(os.environ['SHIELDPM_TEST_FIXTURES'])
for kind, filename in json.loads(os.environ['SHIELDPM_TEST_DATABASES']).items():
    shutil.copyfile(fixtures / filename, directory / f'GeoLite2-{kind}.mmdb')
    trace('database_written', kind=kind)
'''
        self.executable("update-geoip.py", f"#!{sys.executable}\n" + updater)
        wrapper = '''import json, os, sys
from pathlib import Path
script = Path(sys.argv[1])
phase = 'validator' if script.name == 'validate-env.cjs' else 'fingerprint'
with open(os.environ['SHIELDPM_TEST_TRACE'], 'a') as output:
    output.write(json.dumps(dict(phase=phase)) + '\\n')
if phase == 'validator':
    os.execv(os.environ['SHIELDPM_TEST_NODE'], [os.environ['SHIELDPM_TEST_NODE'], *sys.argv[1:]])
if script.name != 'environment-hash.js':
    raise SystemExit('Unexpected Node.js startup action: ' + str(script))
print('fixture-template-fingerprint')
'''
        self.executable("node", f"#!{sys.executable}\n" + wrapper)
        # Startup requires container root identity. These read-only responses
        # let the fixture run under an ordinary CI user without bypassing or
        # changing the production identity guard in envs.sh.
        self.executable("whoami", "#!/bin/sh\nprintf 'root\\n'\n")
        self.executable("id", "#!/bin/sh\nprintf '0\\n'\n")
        self.executable("jq", f"#!{sys.executable}\nimport json, sys\n"
                        "print(json.load(open(sys.argv[-1]))['version'])\n")
        self.executable("migration.sh", '#!/bin/sh\n'
                        "printf '{\"phase\":\"migration\"}\\n' >> \"$SHIELDPM_TEST_TRACE\"\n"
                        + (RUNTIME / "migration.sh").read_text())
        self.executable("start.sh", '#!/bin/sh\n'
                        "printf '{\"phase\":\"module_configuration\"}\\n' >> \"$SHIELDPM_TEST_TRACE\"\n"
                        "exec launch.sh\n")
        self.executable("launch.sh", f"#!{sys.executable}\n"
                        "import json, os\n"
                        "with open(os.environ['SHIELDPM_TEST_TRACE'], 'a') as output:\n"
                        "    output.write(json.dumps(dict(phase='launch')) + '\\n')\n"
                        "with open(os.environ['SHIELDPM_TEST_LAUNCHED'], 'a') as output:\n"
                        "    output.write(json.dumps({key: os.environ.get(key) for key in "
                        "('GOACLA', 'GEOIP_AUTO_UPDATE', 'NGINX_LOAD_GEOIP2_MODULE', 'REGENERATE_ALL')}) + '\\n')\n")
        # Use an explicit clean environment: parent credentials or feature
        # settings must not influence the real validator or trigger its ACME
        # profile network discovery.
        self.environment = {
            "PATH": f"{self.bin}:{os.defpath}",
            "TZ": "UTC",
            "SHIELDPM_TEST_NODE": node,
            "SHIELDPM_TEST_TRACE": str(self.trace),
            "SHIELDPM_TEST_LAUNCHED": str(self.launched),
            "SHIELDPM_TEST_FIXTURES": str(FIXTURES),
            "SHIELDPM_TEST_DATABASES": json.dumps(DATABASES),
        }

    def executable(self, name, source):
        path = self.bin / name
        path.write_text(source)
        path.chmod(0o700)

    def boot(self, **values):
        return subprocess.run(["sh", str(self.envs)],
                              env={**self.environment, **values},
                              capture_output=True, text=True, timeout=10)

    def events(self):
        return [json.loads(line) for line in self.trace.read_text().splitlines()]

    def phases(self):
        return [event["phase"] for event in self.events()]

    def launched_environment(self):
        return json.loads(self.launched.read_text().splitlines()[-1])

    def assert_boot_succeeded(self, result):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        phases = self.phases()
        self.assertLess(phases.index("updater"), phases.index("validator"))
        self.assertLess(phases.index("validator"), phases.index("fingerprint"))
        self.assertLess(phases.index("fingerprint"), phases.index("migration"))
        self.assertLess(phases.index("migration"), phases.index("module_configuration"))
        self.assertLess(phases.index("module_configuration"), phases.index("launch"))

    def test_first_boot_prepares_all_databases_before_real_goaccess_discovery(self):
        self.assertFalse((self.data / "nginx").exists())
        self.assert_boot_succeeded(self.boot())
        self.assertEqual(self.phases().count("updater"), 1)
        for kind, fixture in DATABASES.items():
            database = self.data / "nginx" / f"GeoLite2-{kind}.mmdb"
            self.assertEqual(database.read_bytes(), (FIXTURES / fixture).read_bytes())
        arguments = shlex.split(self.launched_environment()["GOACLA"])
        databases = [argument for argument in arguments if argument.startswith("--geoip-database=")]
        self.assertEqual(databases, [f"--geoip-database={self.data}/nginx/GeoLite2-{kind}.mmdb"
                                     for kind in ("City", "Country", "ASN")])
        self.assertEqual(self.events()[0]["setting"], "true")
        self.assertEqual(self.launched_environment()["GEOIP_AUTO_UPDATE"], "true")

    def test_dotenv_optout_overrides_external_true_and_preserves_custom_database(self):
        self.env_file.write_text("GOA=true\nGEOIP_AUTO_UPDATE=false\n")
        database = self.data / "nginx/GeoLite2-Country.mmdb"
        database.parent.mkdir()
        original = (FIXTURES / DATABASES["Country"]).read_bytes()
        database.write_bytes(original)
        self.assert_boot_succeeded(self.boot(GEOIP_AUTO_UPDATE="true"))
        self.assertEqual(self.events()[0]["setting"], "false")
        self.assertIn("updater_skipped", self.phases())
        self.assertNotIn("database_written", self.phases())
        self.assertEqual(database.read_bytes(), original)
        self.assertEqual(list(database.parent.iterdir()), [database])
        self.assertEqual(self.launched_environment()["GEOIP_AUTO_UPDATE"], "false")
        self.assertIn(f"--geoip-database={database}", shlex.split(self.launched_environment()["GOACLA"]))

    def test_disabled_nginx_module_does_not_disable_database_preparation(self):
        self.env_file.write_text("GOA=true\nNGINX_LOAD_GEOIP2_MODULE=false\n")
        self.assert_boot_succeeded(self.boot())
        written = [event["kind"] for event in self.events() if event["phase"] == "database_written"]
        self.assertEqual(written, list(DATABASES))
        self.assertEqual(self.events()[0]["module"], "false")
        self.assertEqual(self.launched_environment()["NGINX_LOAD_GEOIP2_MODULE"], "false")

    def test_disabled_analytics_does_not_disable_database_preparation(self):
        self.env_file.write_text("GOA=false\n")
        self.assert_boot_succeeded(self.boot())
        self.assertEqual(self.phases().count("database_written"), 3)
        self.assertEqual(self.launched_environment()["NGINX_LOAD_GEOIP2_MODULE"], "false")

    def test_every_boot_invokes_updater_once_before_services(self):
        runs = []
        for _ in range(2):
            offset = len(self.events()) if self.trace.exists() else 0
            self.assert_boot_succeeded(self.boot())
            runs.append(self.phases()[offset:])
        phases = self.phases()
        self.assertEqual(phases.count("updater"), 2)
        self.assertEqual(phases.count("validator"), 2)
        self.assertEqual(phases.count("launch"), 2)
        self.assertEqual(runs[0], runs[1])
        self.assertEqual(runs[0].count("updater"), 1)
        self.assertLess(runs[1].index("updater"), runs[1].index("validator"))
        self.assertLess(runs[1].index("validator"), runs[1].index("migration"))
        self.assertLess(runs[1].index("migration"), runs[1].index("launch"))

    def test_updater_failure_aborts_before_validator_fingerprint_or_service_actions(self):
        result = self.boot(SHIELDPM_TEST_UPDATER_FAILURE="true")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertEqual(self.phases(), ["updater", "updater_failed"])
        self.assertFalse(self.launched.exists())
        self.assertFalse((self.data / "nginx").exists())

    def test_explicit_goaccess_database_arguments_are_preserved(self):
        arguments = "--keep-last=7 --geoip-database=/operator/GeoLite2-City.mmdb"
        self.env_file.write_text(f"GOA=true\nGOACLA={shlex.quote(arguments)}\n")
        self.assert_boot_succeeded(self.boot())
        self.assertEqual(self.launched_environment()["GOACLA"], arguments)
        self.assertEqual(self.phases().count("database_written"), 3)


class GeoipSharedStartupContractTests(unittest.TestCase):
    def test_docker_and_native_services_use_the_same_single_geoip_startup_handoff(self):
        dockerfile = (REPO / "Dockerfile").read_text()
        self.assertRegex(dockerfile, r'(?m)^ENTRYPOINT .*"entrypoint\.sh"\]$')
        unit = (REPO / "rootfs/usr/lib/systemd/system/shieldpm.service").read_text()
        self.assertIn("ExecStart=/usr/local/bin/entrypoint.sh", unit)
        self.assertRegex((RUNTIME / "entrypoint.sh").read_text(), r"(?m)^exec envs\.sh$")
        self.assertRegex((RUNTIME / "envs.sh").read_text(), r"(?m)^exec migration\.sh$")
        self.assertRegex((RUNTIME / "migration.sh").read_text(), r"(?m)^exec start\.sh$")
        start = (RUNTIME / "start.sh").read_text()
        self.assertIn('exec gosu "$PUID:$PGID" launch.sh', start)
        self.assertRegex(start, r"(?m)^\s*exec launch\.sh$")
        sources = [(RUNTIME / name).read_text() for name in
                   ("entrypoint.sh", "envs.sh", "migration.sh", "start.sh", "launch.sh")]
        self.assertEqual(sum(len(re.findall(r"\bupdate-geoip\.py\b", source)) for source in sources), 1)


if __name__ == "__main__":
    unittest.main()
