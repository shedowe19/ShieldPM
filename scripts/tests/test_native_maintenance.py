"""Execute native locking, archive preparation and reinstall actions in fixtures."""

import io
import os
from pathlib import Path
import select
import shlex
import shutil
import subprocess
import tarfile
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[2]
UPDATER = (REPO / "rootfs/usr/local/bin/update-shieldpm").read_text()
INSTALLER = (REPO / "scripts/install.sh").read_text()
STAGER = REPO / "rootfs/usr/local/bin/stage-native-binaries.py"


def elf(arch="amd64"):
    header = bytearray(64)
    header[:6] = b"\x7fELF\x02\x01"
    header[18:20] = (62 if arch == "amd64" else 183).to_bytes(2, "little")
    return bytes(header) + b"isolated archive fixture"


def write_archive(path, entries):
    with tarfile.open(path, "w:gz") as archive:
        for name, data, kind in entries:
            member = tarfile.TarInfo(name)
            member.mode = 0o755
            if kind == "symlink":
                member.type = tarfile.SYMTYPE
                member.linkname = data
                archive.addfile(member)
            elif kind == "hardlink":
                member.type = tarfile.LNKTYPE
                member.linkname = data
                archive.addfile(member)
            else:
                member.size = len(data)
                archive.addfile(member, io.BytesIO(data))


class NativeMaintenanceTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

    def lock_block(self, source):
        start = source.index("MAINTENANCE_LOCK_DIR=")
        end_marker = "# Use a private" if source is UPDATER else "INSTALL_TMP_DIR="
        block = source[start:source.index(end_marker, start)]
        return block.replace("/run/shieldpm-maintenance", str(self.root / "maintenance")).replace(
            "install -d -o 0 -g 0 -m 700", "install -d -m 700")

    def test_shared_lock_survives_updater_exec_and_excludes_installer(self):
        updater_lock = self.lock_block(UPDATER)
        # The second shell really execs, reacquires the inherited descriptor,
        # then waits while a different installer process attempts the same lock.
        after_exec = updater_lock + '\nprintf "HELD\\n"\nread -r release\n'
        holder = subprocess.Popen(["bash", "-eu", "-c", updater_lock +
                                   "exec bash -eu -c " + shlex.quote(after_exec)],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            self.assertTrue(select.select([holder.stdout], [], [], 5)[0], "Lock holder did not become ready")
            self.assertEqual(holder.stdout.readline(), "HELD\n")
            competing = subprocess.run(["bash", "-eu", "-c", self.lock_block(INSTALLER)],
                                       capture_output=True, text=True, timeout=5)
            self.assertNotEqual(competing.returncode, 0)
            self.assertIn("already running", competing.stderr)
        finally:
            holder.communicate("release\n", timeout=5)
        self.assertEqual(holder.returncode, 0)
        next_run = subprocess.run(["bash", "-eu", "-c", self.lock_block(INSTALLER)],
                                  capture_output=True, text=True, timeout=5)
        self.assertEqual(next_run.returncode, 0, next_run.stderr)
        self.assertEqual((self.root / "maintenance").stat().st_mode & 0o777, 0o700)

    def test_lock_rejects_a_symlink_directory(self):
        (self.root / "elsewhere").mkdir()
        (self.root / "maintenance").symlink_to(self.root / "elsewhere", target_is_directory=True)
        result = subprocess.run(["bash", "-eu", "-c", self.lock_block(UPDATER)],
                                capture_output=True, text=True, timeout=5)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "elsewhere/operation.lock").exists())

    def test_installer_rejects_a_payload_alias_inside_application_directory(self):
        live_app = self.root / "app"
        payload = live_app / "unpacked"
        payload.mkdir(parents=True)
        for filename in ("app/package.json", "html/frontend/index.html", "usr/local/nginx/sbin/nginx",
                         "rootfs/usr/local/bin/start.sh", "rootfs/usr/local/bin/update-geoip.py"):
            path = payload / filename
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("packaged artifact")
        preamble = INSTALLER[:INSTALLER.index("# This is the same lock")]
        preamble = preamble.replace('if [ "$EUID" -ne 0 ]; then\n  echo "Please run as root"\n  exit 1\nfi', "")
        preamble = preamble.replace("/app/*|/html/frontend/*)", str(live_app) + "/*|/html/frontend/*)")
        (payload / "install.sh").write_text(preamble + '\nprintf "UNSAFE_INSTALL_STARTED\\n"\n')
        alias = self.root / "payload-link"
        alias.symlink_to(payload, target_is_directory=True)
        result = subprocess.run(["bash", str(alias / "install.sh")], capture_output=True, text=True, timeout=5)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Extract the installer outside", result.stderr)
        self.assertNotIn("UNSAFE_INSTALL_STARTED", result.stdout)
        self.assertTrue((payload / "app/package.json").exists())

    def install_fixture(self, failure="", first_install=False):
        live = self.root / "live"
        payload = self.root / "payload"
        (payload / "app").mkdir(parents=True)
        (payload / "html/frontend").mkdir(parents=True)
        (payload / "app/package.json").write_text("new backend")
        (payload / "app/.git-commit").write_text("new commit")
        (payload / "html/frontend/index.html").write_text("new frontend")
        (live / "data").mkdir(parents=True)
        (live / "data/.env").write_text("private credentials")
        if not first_install:
            (live / "app/node_modules/removed-dependency").mkdir(parents=True)
            (live / "app/.old-hidden").write_text("old hidden")
            (live / "app/node_modules/removed-dependency/index.js").write_text("old dependency")
            (live / "html/frontend/assets").mkdir(parents=True)
            (live / "html/frontend/assets/old.js").write_text("old bundle")
        helpers = INSTALLER[INSTALLER.index("INSTALL_TMP_DIR="):INSTALLER.index("enable_node_system_ca()")]
        helpers = helpers.replace("/tmp/shieldpm-install.XXXXXX", str(self.root / "recovery.XXXXXX"))
        helpers = helpers.replace("INSTALL_BACKEND_DIR=/app", f"INSTALL_BACKEND_DIR={shlex.quote(str(live / 'app'))}")
        helpers = helpers.replace("INSTALL_FRONTEND_DIR=/html/frontend", f"INSTALL_FRONTEND_DIR={shlex.quote(str(live / 'html/frontend'))}")
        actions = INSTALLER[INSTALLER.index("# 3. Copy Pre-built Binaries"):INSTALLER.index("# 5. Copy Rootfs Overlays")]
        actions = actions.replace(" /html/", " " + shlex.quote(str(live / "html")) + "/")
        mocks = '''
systemctl() { printf '%s\\n' "$*" >> "$FIXTURE_ROOT/service-calls"; return 0; }
cp() {
    if [ "$FAILURE" = frontend ] && [ "${2:-}" = html/frontend/. ]; then return 73; fi
    command cp "$@"
}
'''
        ending = '\nINSTALL_ROLLBACK=false\n'
        if failure == "migration":
            ending += 'INSTALL_MIGRATIONS_STARTED=true\nexit 74\n'
        result = subprocess.run(["bash", "-e", "-c", helpers + mocks + actions + ending],
                                cwd=payload, capture_output=True, text=True, timeout=10,
                                env={**os.environ, "FIXTURE_ROOT": str(self.root), "FAILURE": failure})
        return result, live

    def test_reinstall_removes_obsolete_and_hidden_files_and_preserves_data(self):
        result, live = self.install_fixture()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(sorted(str(p.relative_to(live / "app")) for p in (live / "app").rglob("*") if p.is_file()),
                         [".git-commit", "package.json"])
        self.assertEqual((live / "html/frontend/index.html").read_text(), "new frontend")
        self.assertFalse((live / "html/frontend/assets/old.js").exists())
        self.assertEqual((live / "data/.env").read_text(), "private credentials")

    def test_reinstall_copy_failure_restores_both_trees_and_previous_service(self):
        result, live = self.install_fixture("frontend")
        self.assertEqual(result.returncode, 73, result.stderr)
        self.assertEqual((live / "app/.old-hidden").read_text(), "old hidden")
        self.assertEqual((live / "app/node_modules/removed-dependency/index.js").read_text(), "old dependency")
        self.assertEqual((live / "html/frontend/assets/old.js").read_text(), "old bundle")
        self.assertFalse((live / "app/package.json").exists())
        self.assertIn("start shieldpm", (self.root / "service-calls").read_text())
        self.assertFalse(list(self.root.glob("recovery.*")))

    def test_failed_first_install_removes_partial_application_trees(self):
        result, live = self.install_fixture("frontend", first_install=True)
        self.assertEqual(result.returncode, 73, result.stderr)
        self.assertFalse((live / "app").exists())
        self.assertFalse((live / "html/frontend").exists())
        self.assertEqual((live / "data/.env").read_text(), "private credentials")

    def test_failure_after_migration_boundary_retains_new_files_and_backup(self):
        result, live = self.install_fixture("migration")
        self.assertEqual(result.returncode, 74, result.stderr)
        self.assertEqual((live / "app/package.json").read_text(), "new backend")
        backups = list(self.root.glob("recovery.*"))
        self.assertEqual(len(backups), 1)
        self.assertEqual((backups[0] / "backend-backup/content/.old-hidden").read_text(), "old hidden")
        self.assertNotIn("start shieldpm", (self.root / "service-calls").read_text())

    def archive_fixture(self, entries, arch="amd64"):
        archive = self.root / "archive.tar.gz"
        write_archive(archive, entries)
        destination = self.root / "staged"
        result = subprocess.run(["python3", str(STAGER), "nginx", str(archive), str(destination), arch],
                                capture_output=True, text=True, timeout=10)
        return result, destination

    def test_stage_preserves_files_and_safe_symlink_meaning(self):
        result, destination = self.archive_fixture([
            ("./usr/local/nginx/sbin/nginx", elf(), "file"),
            ("usr/local/lib/libexample.so.1", b"shared library", "file"),
            ("usr/local/lib/libexample.so", "/usr/local/lib/libexample.so.1", "symlink"),
            ("usr/local/lib/libcopy.so", "usr/local/lib/libexample.so.1", "hardlink"),
        ])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((destination / "usr/local/lib/libexample.so").read_bytes(), b"shared library")
        self.assertEqual(os.readlink(destination / "usr/local/lib/libexample.so"), "libexample.so.1")
        self.assertEqual((destination / "usr/local/lib/libcopy.so").read_bytes(), b"shared library")

    def test_wrong_architecture_is_rejected(self):
        result, _ = self.archive_fixture([("usr/local/nginx/sbin/nginx", elf("arm64"), "file")])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("does not match", result.stderr)

    def test_missing_binary_and_traversal_and_link_writes_are_rejected(self):
        cases = [
            [("usr/local/share/readme", b"no executable", "file")],
            [("../escaped", b"escape", "file")],
            [("/usr/local/nginx/sbin/nginx", elf(), "file")],
            [("usr/local/nginx/sbin/nginx", elf(), "file"), ("usr/link", "/etc/passwd", "symlink")],
            [("usr/local/nginx/sbin/nginx", elf(), "file"), ("usr/link", "local", "symlink"),
             ("usr/link/file", b"through link", "file")],
        ]
        for entries in cases:
            with self.subTest(entries=[entry[0] for entry in entries]):
                result, destination = self.archive_fixture(entries)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(destination.exists())
        self.assertFalse((self.root / "escaped").exists())

    def update_fixture(self, failure=""):
        source = self.root / "source"
        live = self.root / "live"
        run = self.root / "update"
        fixture_archives = self.root / "archives"
        for directory in (source / "backend", source / "frontend/dist", source / "rootfs/usr/local/bin",
                          live / "app", live / "html/frontend", live / "usr/local/bin", fixture_archives, run):
            directory.mkdir(parents=True, exist_ok=True)
        shutil.copy(STAGER, source / "rootfs/usr/local/bin/stage-native-binaries.py")
        (source / "backend/package.json").write_text("new backend")
        (source / "frontend/dist/index.html").write_text("new frontend")
        (live / "app/old.js").write_text("old backend")
        (live / "html/frontend/old.html").write_text("old frontend")
        for binary in ("anubis", "oauth2-proxy"):
            (live / "usr/local/bin" / binary).write_bytes(b"old binary")
        write_archive(fixture_archives / "nginx.tar.gz", [("usr/local/nginx/sbin/nginx", elf(), "file")])
        if failure == "archive":
            (fixture_archives / "nginx.tar.gz").write_bytes(b"truncated archive")
        write_archive(fixture_archives / "anubis.tar.gz", [("anubis-1.27.0-linux-amd64/bin/anubis", elf(), "file")])
        write_archive(fixture_archives / "oauth2-proxy.tar.gz", [("oauth2-proxy-v7.15.3.linux-amd64/oauth2-proxy", elf(), "file")])
        functions = UPDATER[UPDATER.index("stage_native_binaries() {"):UPDATER.index('echo "--> [1/9]')]
        actions = UPDATER[UPDATER.index("# Complete every prompt"):UPDATER.index('echo "--> [9/9]')]
        program = functions + actions
        program = program.replace("/usr/local/bin/anubis", str(live / "usr/local/bin/anubis"))
        program = program.replace("/usr/local/bin/oauth2-proxy", str(live / "usr/local/bin/oauth2-proxy"))
        program = program.replace(' /usr/\n', ' "' + str(live / "usr") + '/"\n')
        program = program.replace('"$TEMP_DIR/rootfs/"* /\n', '"$TEMP_DIR/rootfs/"* "' + str(live) + '/"\n')
        setup = '''
set -euo pipefail
service_running=true
BACKEND_DIR="$FIXTURE_ROOT/live/app"
FRONTEND_DIR="$FIXTURE_ROOT/live/html/frontend"
UPDATE_RUN_DIR="$FIXTURE_ROOT/update"
TEMP_DIR="$FIXTURE_ROOT/source"
LATEST_SHA_FULL=fixture-commit
confirm_database_recovery_checkpoint() { return 0; }
dpkg() { echo amd64; }
ldconfig() { :; }
systemctl() {
    printf '%s\\n' "$*" >> "$FIXTURE_ROOT/service-calls"
    if [ "$1" = stop ]; then service_running=false; fi
}
curl() {
    [ "$service_running" = true ] || { echo "download during downtime" >&2; return 70; }
    [ "$FAILURE" != download ] || return 22
    local output="" name=""
    while [ "$#" -gt 0 ]; do
        case "$1" in
            -o) output=$2; shift 2 ;;
            --connect-timeout|--max-time|--retry|--retry-max-time) shift 2 ;;
            https://*) case "$1" in
                *nginx-linux*) name=nginx ;;
                *anubis*) name=anubis ;;
                *oauth2-proxy*) name=oauth2-proxy ;;
            esac; shift ;;
            *) shift ;;
        esac
    done
    printf '%s\\n' "$name" >> "$FIXTURE_ROOT/downloads"
    command cp "$FIXTURE_ROOT/archives/$name.tar.gz" "$output"
}
'''
        result = subprocess.run(["bash", "-c", setup + program], input="yyy", text=True,
                                capture_output=True, timeout=10,
                                env={**os.environ, "FIXTURE_ROOT": str(self.root), "FAILURE": failure})
        return result, live

    def test_updater_stages_all_binary_downloads_before_stopping_service(self):
        result, live = self.update_fixture()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / "downloads").read_text().splitlines(), ["nginx", "anubis", "oauth2-proxy"])
        self.assertEqual((self.root / "service-calls").read_text().splitlines(), ["stop shieldpm"])
        self.assertEqual((live / "usr/local/nginx/sbin/nginx").read_bytes(), elf())
        self.assertEqual((live / "usr/local/bin/anubis").read_bytes(), elf())
        self.assertEqual((live / "usr/local/bin/oauth2-proxy").read_bytes(), elf())
        self.assertEqual((live / "app/package.json").read_text(), "new backend")

    def test_download_failure_leaves_service_and_application_untouched(self):
        result, live = self.update_fixture("download")
        self.assertEqual(result.returncode, 22, result.stderr)
        self.assertFalse((self.root / "service-calls").exists())
        self.assertEqual((live / "app/old.js").read_text(), "old backend")

    def test_invalid_archive_leaves_service_and_application_untouched(self):
        result, live = self.update_fixture("archive")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("preflight failed", result.stderr)
        self.assertFalse((self.root / "service-calls").exists())
        self.assertEqual((live / "app/old.js").read_text(), "old backend")


if __name__ == "__main__":
    unittest.main()
