"""Offline bootstrap, prepared installer choices and retired runtime cleanup."""
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

    def retire_runtime(self, configuration, lua_root):
        helper = REPO / "rootfs/usr/local/bin/runtime-config.sh"
        return subprocess.run(
            ["sh", "-ec", '. "$1"; remove_legacy_wasm_runtime "$2" "$3"',
             "fixture", str(helper), str(configuration), str(lua_root)],
            capture_output=True, text=True, check=False,
        )

    def managed_runtime(self):
        return ("    # ShieldPM managed Wasm runtime begin\n"
                "    wasm_vm wasmtime;\n"
                "    # ShieldPM managed Wasm runtime end\n")

    def test_repeated_cleanup_removes_only_owned_runtime_block_and_lua_files(self):
        configuration = self.root / "nginx.conf"
        expected = "events {}\nhttp {\n    server {}\n}\n"
        configuration.write_text(expected.replace("http {\n", "http {\n" + self.managed_runtime()))
        configuration.chmod(0o640)
        lua_root = self.root / "lua"
        lua_root.mkdir()
        for name in ("wasm.lua", "wasi.lua", "other.lua"):
            (lua_root / name).write_text(name)
        uploads = self.root / "data/wasm"
        uploads.mkdir(parents=True)
        uploaded = uploads / "user.wasm"
        uploaded.write_bytes(b"user upload")
        for _ in range(2):
            result = self.retire_runtime(configuration, lua_root)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(configuration.read_text(), expected)
            self.assertEqual(configuration.stat().st_mode & 0o777, 0o640)
            self.assertFalse((lua_root / "wasm.lua").exists())
            self.assertFalse((lua_root / "wasi.lua").exists())
            self.assertEqual((lua_root / "other.lua").read_text(), "other.lua")
            self.assertEqual(uploaded.read_bytes(), b"user upload")

    def test_cleanup_preserves_unmanaged_configuration_without_replacing_it(self):
        configuration = self.root / "nginx.conf"
        original = "http {\n    wasm_vm wasmtime; # explicitly managed by the operator\n}\n"
        configuration.write_text(original)
        inode = configuration.stat().st_ino
        result = self.retire_runtime(configuration, self.root / "missing-lua")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(configuration.read_text(), original)
        self.assertEqual(configuration.stat().st_ino, inode)

    def test_cleanup_unlinks_obsolete_file_symlink_without_touching_its_target(self):
        configuration = self.root / "nginx.conf"
        configuration.write_text("http {}\n")
        lua_root = self.root / "lua"
        lua_root.mkdir()
        target = self.root / "private.lua"
        target.write_text("retained operator module")
        (lua_root / "wasm.lua").symlink_to(target)
        result = self.retire_runtime(configuration, lua_root)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((lua_root / "wasm.lua").is_symlink())
        self.assertEqual(target.read_text(), "retained operator module")

    def test_cleanup_refuses_a_symlink_lua_directory_before_changing_files(self):
        configuration = self.root / "nginx.conf"
        original = "http {\n" + self.managed_runtime() + "}\n"
        configuration.write_text(original)
        target = self.root / "operator-lua"
        target.mkdir()
        (target / "wasm.lua").write_text("retained")
        link = self.root / "lua"
        link.symlink_to(target, target_is_directory=True)
        result = self.retire_runtime(configuration, link)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Refusing a symlink Lua directory", result.stderr)
        self.assertEqual(configuration.read_text(), original)
        self.assertEqual((target / "wasm.lua").read_text(), "retained")

    def test_cleanup_refuses_modified_or_malformed_managed_blocks(self):
        configuration = self.root / "nginx.conf"
        for block in (self.managed_runtime().replace("wasm_vm wasmtime;", "include operator.conf;"),
                      self.managed_runtime().replace("    # ShieldPM managed Wasm runtime end\n", ""),
                      self.managed_runtime() * 2):
            with self.subTest(block=block):
                original = "http {\n" + block + "}\n"
                configuration.write_text(original)
                result = self.retire_runtime(configuration, self.root / "missing-lua")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Malformed legacy ShieldPM runtime block", result.stderr)
                self.assertEqual(configuration.read_text(), original)

    def native_runtime_fixture(self, build="--with-http_ssl_module", linkage="clean"):
        prefix = self.root / "usr/local"
        library = prefix / "lib"
        resty = prefix / "share/lua/5.1/resty"
        library.mkdir(parents=True)
        resty.mkdir(parents=True)
        owned = [library / "libwasmtime.so", library / "libwasmtime.so.49.0.2", resty / "proxy-wasm.lua"]
        custom = [library / "liboperator.so", library / "libwasmtime.so.operator", resty / "jwt.lua"]
        for filename in owned + custom:
            filename.write_text(filename.name)
        tools = self.root / "tools"
        tools.mkdir()
        binary = tools / "real-nginx"
        binary.write_text("#!/bin/sh\nprintf '%s\\n' 'nginx version: nginx/1.31.6' "
                          f"'configure arguments: {build}'\n")
        binary.chmod(0o755)
        executable = tools / "nginx"
        executable.symlink_to(binary)
        ldd = tools / "ldd"
        ldd.write_text('''#!/bin/sh
printf '%s\\n' "$1" >> "$NATIVE_LINK_PROBE_LOG"
case "$NATIVE_LINK_PROBE" in
    needed) printf '%s\\n' 'libwasmtime.so => /usr/local/lib/libwasmtime.so (0x123)' ;;
    missing) printf '%s\\n' 'libc.so.6 => not found' ;;
    failure) printf '%s\\n' 'not a dynamic executable'; exit 1 ;;
    empty) exit 0 ;;
    changed) printf '# changed\\n' >> "$1"; printf '%s\\n' 'libc.so.6 => /lib/libc.so.6 (0x123)' ;;
    *) printf '%s\\n' 'libc.so.6 => /lib/libc.so.6 (0x123)' ;;
esac
''')
        ldd.chmod(0o755)
        return {"prefix": prefix, "tools": tools, "binary": binary, "executable": executable,
                "owned": owned, "custom": custom, "linkage": linkage}

    def retire_native_runtime(self, fixture):
        helper = REPO / "rootfs/usr/local/bin/runtime-config.sh"
        return subprocess.run(
            ["sh", "-ec", '. "$1"; remove_legacy_wasm_binary_support "$2" "$3"',
             "fixture", str(helper), str(fixture["executable"]), str(fixture["prefix"])],
            env={**os.environ, "PATH": f'{fixture["tools"]}:{os.environ["PATH"]}',
                 "NATIVE_LINK_PROBE": fixture["linkage"],
                 "NATIVE_LINK_PROBE_LOG": str(self.root / "linkage.log")},
            capture_output=True, text=True, check=False,
        )

    def test_native_cleanup_preserves_support_while_old_nginx_has_the_module(self):
        fixture = self.native_runtime_fixture(build="--add-module=/src/wasm-nginx-module")
        result = self.retire_native_runtime(fixture)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(all(filename.exists() for filename in fixture["owned"] + fixture["custom"]))
        self.assertFalse((self.root / "linkage.log").exists())

    def test_native_cleanup_preserves_support_if_linkage_still_requires_wasmtime(self):
        fixture = self.native_runtime_fixture(linkage="needed")
        result = self.retire_native_runtime(fixture)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(all(filename.exists() for filename in fixture["owned"] + fixture["custom"]))

    def test_native_cleanup_removes_only_retired_support_after_both_proofs(self):
        fixture = self.native_runtime_fixture()
        for _ in range(2):
            result = self.retire_native_runtime(fixture)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(all(not filename.exists() for filename in fixture["owned"]))
            for filename in fixture["custom"]:
                self.assertEqual(filename.read_text(), filename.name)
        self.assertEqual((self.root / "linkage.log").read_text().splitlines(), [str(fixture["binary"])])

    def test_native_cleanup_keeps_all_files_when_proof_is_incomplete_or_changes(self):
        fixture = self.native_runtime_fixture()
        for linkage in ("failure", "missing", "empty", "changed"):
            with self.subTest(linkage=linkage):
                fixture["linkage"] = linkage
                result = self.retire_native_runtime(fixture)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("Retaining legacy native runtime files", result.stderr)
                self.assertTrue(all(filename.exists() for filename in fixture["owned"] + fixture["custom"]))
        fixture["binary"].write_text("#!/bin/sh\nexit 7\n")
        result = self.retire_native_runtime(fixture)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Nginx build information is unavailable", result.stderr)
        self.assertTrue(all(filename.exists() for filename in fixture["owned"] + fixture["custom"]))

    def test_native_cleanup_unlinks_only_owned_symlink_and_preserves_target(self):
        fixture = self.native_runtime_fixture()
        target = self.root / "operator-library.so"
        target.write_text("retained outside target")
        link = fixture["prefix"] / "lib/libwasmtime.so.49"
        link.symlink_to(target)
        result = self.retire_native_runtime(fixture)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(link.is_symlink())
        self.assertEqual(target.read_text(), "retained outside target")

    def test_native_cleanup_refuses_symlink_directory_without_removing_files(self):
        fixture = self.native_runtime_fixture()
        library = fixture["prefix"] / "lib"
        target = self.root / "operator-library"
        library.rename(target)
        library.symlink_to(target, target_is_directory=True)
        result = self.retire_native_runtime(fixture)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Retaining legacy native runtime files", result.stderr)
        self.assertTrue(all(filename.exists() for filename in fixture["owned"] + fixture["custom"]))
        self.assertFalse((self.root / "linkage.log").exists())


if __name__ == "__main__":
    unittest.main()
