"""Offline bootstrap, prepared installer choices and reversible Wasm configuration."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[2]


class BackupOperationsTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def test_launch_never_registers_acme_before_services(self):
        source = (REPO / "rootfs/usr/local/bin/launch.sh").read_text()
        prefix = source[:source.index('if [ "$ACME_OCSP_STAPLING"')]
        result = subprocess.run(["sh", "-c", '''
certbot() { echo "UNEXPECTED_NETWORK"; return 1; }
curl() { echo "UNEXPECTED_NETWORK"; return 1; }
sleep() { echo "UNEXPECTED_BLOCK"; exit 74; }
''' + prefix + '\necho SERVICES_READY'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("SERVICES_READY", result.stdout)
        self.assertNotIn("UNEXPECTED_", result.stdout)

    def test_restore_is_applied_once_before_migration_prerun_and_env_loading(self):
        source = (REPO / "rootfs/usr/local/bin/entrypoint.sh").read_text()
        envs = (REPO / "rootfs/usr/local/bin/envs.sh").read_text()
        self.assertEqual((source + envs).count("backup-restore.js --apply"), 1)
        data = self.root / "data"
        (data / "npmplus").mkdir(parents=True)
        (data / "prerun").mkdir()
        app = self.root / "app"
        app.mkdir()
        (app / "backup-restore.js").write_text("fixture")
        commands = self.root / "bin"
        commands.mkdir()
        (commands / "node").write_text('#!/bin/sh\n[ -d "$FIXTURE_ROOT/data/npmplus" ] && [ ! -d "$FIXTURE_ROOT/data/shieldpm" ] || exit 61\necho APPLY >> "$FIXTURE_ROOT/order"\n')
        (commands / "node").chmod(0o755)
        (commands / "envs.sh").write_text('#!/bin/sh\necho ENVS >> "$FIXTURE_ROOT/order"\n')
        (commands / "envs.sh").chmod(0o755)
        (data / "prerun/test.sh").write_text('#!/bin/sh\necho PRERUN >> "$FIXTURE_ROOT/order"\n')
        program = source.replace("/app/", str(app) + "/").replace("/data", str(data)).replace("/etc/crowdsec", str(self.root / "crowdsec"))
        result = subprocess.run(["sh", "-c", program], capture_output=True, text=True,
                                env={**os.environ, "FIXTURE_ROOT": str(self.root), "ENABLE_PRERUN": "true", "PATH": str(commands) + os.pathsep + os.environ["PATH"]})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / "order").read_text().splitlines(), ["APPLY", "PRERUN", "ENVS"])
        self.assertTrue((data / "shieldpm").is_dir())

    def prepared_installer(self, responses, legacy=None, fail_download=False):
        data = self.root / "data/shieldpm"
        data.mkdir(parents=True)
        if legacy:
            (data / "default.json").write_text(json.dumps({"database": {"engine": legacy}}))
        source = (REPO / "scripts/install.sh").read_text()
        preparation = source[source.index("# Collect every ShieldPM"):source.index("# 3. Copy Pre-built Binaries")]
        preparation = preparation.replace("/data/shieldpm", str(data))
        setup = '''set -euo pipefail
INSTALL_TMP_DIR="$FIXTURE_ROOT/work"
INSTALL_SOURCE_DIR="$FIXTURE_REPO"
mkdir "$INSTALL_TMP_DIR"
dpkg() { echo amd64; }
apt-get() { echo apt >> "$FIXTURE_ROOT/preparation"; }
curl() { echo download >> "$FIXTURE_ROOT/preparation"; return 22; }
systemctl() { echo stop >> "$FIXTURE_ROOT/stopped"; }
'''
        result = subprocess.run(["bash", "-c", setup + preparation + '\nsystemctl stop shieldpm'],
                                input=responses, capture_output=True, text=True,
                                env={**os.environ, "FIXTURE_ROOT": str(self.root), "FIXTURE_REPO": str(REPO)})
        return result

    def test_preparation_download_failure_never_stops_existing_service(self):
        result = self.prepared_installer("1\nn\ny\nn\nn\n", fail_download=True)
        self.assertEqual(result.returncode, 22, result.stderr)
        self.assertFalse((self.root / "stopped").exists())

    def test_conflicting_legacy_provider_is_rejected_before_stop(self):
        result = self.prepared_installer("3\n", legacy="mysql")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("provider switch requires a separate data migration", result.stderr)
        self.assertFalse((self.root / "stopped").exists())

    def test_matching_legacy_provider_keeps_effective_file_without_credentials_prompt(self):
        result = self.prepared_installer("2\nn\nn\nn\nn\n", legacy="mysql2")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Keeping the effective legacy database", result.stdout)
        self.assertEqual(json.loads((self.root / "data/shieldpm/default.json").read_text())["database"]["engine"], "mysql2")

    def test_wasm_directive_is_single_reversible_and_preserves_explicit_configuration(self):
        configuration = self.root / "nginx.conf"
        configuration.write_text("events {}\nhttp {\n    server {}\n}\n")
        binary = self.root / "nginx"
        binary.write_text("#!/bin/sh\necho 'configure arguments: --add-module=/src/wasm-nginx-module' >&2\n")
        binary.chmod(0o755)
        helper = REPO / "rootfs/usr/local/bin/runtime-config.sh"
        for _ in range(2):
            subprocess.run(["sh", "-ec", '. "$1"; configure_wasm_runtime "$2" "$3"', "fixture", str(helper), str(configuration), str(binary)], check=True)
        self.assertEqual(configuration.read_text().count("wasm_vm wasmtime;"), 1)
        binary.write_text("#!/bin/sh\necho 'configure arguments: --with-threads' >&2\n")
        subprocess.run(["sh", "-ec", '. "$1"; configure_wasm_runtime "$2" "$3"', "fixture", str(helper), str(configuration), str(binary)], check=True)
        self.assertNotIn("wasm_vm", configuration.read_text())
        configuration.write_text("http {\n    wasm_vm wasmtime; # explicitly managed by the operator\n}\n")
        binary.write_text("#!/bin/sh\necho 'configure arguments: --add-module=/src/wasm-nginx-module' >&2\n")
        subprocess.run(["sh", "-ec", '. "$1"; configure_wasm_runtime "$2" "$3"', "fixture", str(helper), str(configuration), str(binary)], check=True)
        self.assertEqual(configuration.read_text().count("wasm_vm"), 1)


if __name__ == "__main__":
    unittest.main()
