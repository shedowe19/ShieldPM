"""Exercise migration and configuration helpers in temporary directories only."""

import os
from pathlib import Path
import shlex
import shutil
import sqlite3
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[2]
MIGRATIONS = REPO / "rootfs/usr/local/bin/migrate-data.sh"


class InfrastructureTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def shell(self, command, *arguments, **kwargs):
        return subprocess.run(
            ["sh", "-c", '. "$1"; shift; ' + command, "test", str(MIGRATIONS), *map(str, arguments)],
            text=True, capture_output=True, **kwargs,
        )

    def test_legacy_migration_preserves_dotfiles_and_conflicting_originals(self):
        source, target = self.root / "old", self.root / "new"
        source.mkdir()
        target.mkdir()
        (source / ".secret").write_text("old-secret")
        (source / "config").write_text("legacy-settings")
        (target / "config").write_text("current-settings")
        result = self.shell('migrate_legacy_directory "$1" "$2"', source, target)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(source.exists())
        self.assertEqual((target / ".secret").read_text(), "old-secret")
        self.assertEqual((target / "config").read_text(), "current-settings")
        backups = list(self.root.glob("old.migrated.*/original"))
        self.assertEqual(len(backups), 1)
        self.assertEqual((backups[0] / "config").read_text(), "legacy-settings")
        # Subsequent starts must not resurrect files intentionally removed after migration.
        (target / ".secret").unlink()
        result = self.shell('migrate_legacy_directory "$1" "$2"', source, target)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((target / ".secret").exists())

    def test_failed_migration_does_not_delete_source(self):
        source, target = self.root / "old", self.root / "new"
        source.mkdir()
        (source / "config").write_text("only-copy")
        result = self.shell('cp() { return 1; }; migrate_legacy_directory "$1" "$2"', source, target)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((source / "config").read_text(), "only-copy")
        self.assertEqual(list(self.root.glob("old.migrated.*")), [])

    def test_sqlite_migration_preserves_committed_wal_transactions(self):
        source, target = self.root / "database.sqlite", self.root / "new/database.sqlite"
        database = sqlite3.connect(source)
        self.addCleanup(database.close)
        database.execute("PRAGMA journal_mode=WAL")
        database.execute("PRAGMA wal_autocheckpoint=0")
        database.execute("CREATE TABLE example (value TEXT)")
        database.execute("INSERT INTO example VALUES ('committed in WAL')")
        database.commit()
        self.assertTrue(Path(str(source) + "-wal").stat().st_size > 0)
        result = self.shell('migrate_legacy_sqlite "$1" "$2" "$3"', source, target, self.root / "backups")
        self.assertEqual(result.returncode, 0, result.stderr)
        with sqlite3.connect(target) as restored:
            self.assertEqual(restored.execute("SELECT value FROM example").fetchall(), [("committed in WAL",)])
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)
        self.assertFalse(source.exists())
        self.assertEqual(len(list((self.root / "backups").glob("*/database.sqlite-wal"))), 1)

    def test_invalid_sqlite_migration_leaves_source_and_destination_untouched(self):
        source, target = self.root / "database.sqlite", self.root / "new/database.sqlite"
        source.write_text("corrupted database")
        result = self.shell('migrate_legacy_sqlite "$1" "$2" "$3"', source, target, self.root / "backups")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(source.read_text(), "corrupted database")
        self.assertFalse(target.exists())
        self.assertEqual(list(target.parent.glob(".sqlite-migration-*")), [])

    def test_sqlite_migration_does_not_overwrite_an_existing_database(self):
        source, target = self.root / "database.sqlite", self.root / "current.sqlite"
        source.write_text("old database")
        target.write_text("current database")
        result = self.shell('migrate_legacy_sqlite "$1" "$2" "$3"', source, target, self.root / "backups")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(source.read_text(), "old database")
        self.assertEqual(target.read_text(), "current database")

    def test_sqlite_archive_copy_failure_preserves_the_complete_source_set(self):
        source, target = self.root / "database.sqlite", self.root / "new/database.sqlite"
        database = sqlite3.connect(source)
        self.addCleanup(database.close)
        database.execute("PRAGMA journal_mode=WAL")
        database.execute("CREATE TABLE example (value TEXT)")
        database.commit()
        original = {str(path): path.read_bytes() for path in self.root.glob("database.sqlite*")}
        result = self.shell('cp() { return 1; }; migrate_legacy_sqlite "$1" "$2" "$3"', source, target, self.root / "backups")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(target.exists())
        for path, content in original.items():
            self.assertTrue(Path(path).exists())
            # SQLite readers may update SHM reader marks without changing data.
            if not path.endswith("-shm"):
                self.assertEqual(Path(path).read_bytes(), content)
        self.assertEqual(list(target.parent.glob(".sqlite-migration-*")), [])

    def test_sqlite_cleanup_failure_retains_complete_original_archive(self):
        source, target = self.root / "database.sqlite", self.root / "new/database.sqlite"
        database = sqlite3.connect(source)
        self.addCleanup(database.close)
        database.execute("PRAGMA journal_mode=WAL")
        database.execute("CREATE TABLE example (value TEXT)")
        database.execute("INSERT INTO example VALUES ('committed')")
        database.commit()
        program = '''rm() {
            for file do
                case "$file" in *-wal) return 1 ;; -*) continue ;; *) command rm -f "$file" ;; esac
            done
        }; migrate_legacy_sqlite "$1" "$2" "$3"'''
        result = self.shell(program, source, target, self.root / "backups")
        self.assertNotEqual(result.returncode, 0)
        backups = list((self.root / "backups").glob("database.sqlite.migrated.*"))
        self.assertEqual(len(backups), 1)
        self.assertIn(str(backups[0]), result.stdout)
        self.assertTrue((backups[0] / "database.sqlite").exists())
        self.assertTrue((backups[0] / "database.sqlite-wal").exists())
        for path in (target, backups[0] / "database.sqlite"):
            with sqlite3.connect(path) as restored:
                self.assertEqual(restored.execute("SELECT value FROM example").fetchall(), [("committed",)])

    def test_startup_socket_cleanup_preserves_foreign_services(self):
        runtime = self.root / "run"
        runtime.mkdir()
        for name in ("docker.sock", "foreign.sock", "shieldpm.sock", "goaccess.sock", "php82.sock"):
            # The cleanup is a filename operation; no listening socket is needed.
            (runtime / name).touch()
        source = (REPO / "rootfs/usr/local/bin/start.sh").read_text()
        cleanup = next(line for line in source.splitlines() if line.startswith("rm ") and "/run/" in line)
        result = subprocess.run(["sh", "-c", cleanup.replace("/run/", str(runtime) + "/")], capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(sorted(path.name for path in runtime.iterdir()), ["docker.sock", "foreign.sock"])

    def test_startup_ownership_does_not_follow_links_outside_data(self):
        data = self.root / "data"
        data.mkdir()
        outside = self.root / "outside"
        link = data / "link"
        link.symlink_to(outside)
        source = (REPO / "rootfs/usr/local/bin/start.sh").read_text()
        ownership = next(line.split("-exec ", 1)[1] for line in source.splitlines() if "find /data -not" in line)
        # Use the actual ownership command as the current test user. A dangling
        # link proves whether chown touches the link or follows its target.
        ownership = ownership.replace("0:0", f"{os.geteuid()}:{os.getegid()}")
        result = subprocess.run(["sh", "-eu", "-c", f'find "$1" -type l -exec {ownership}', "test", str(data)], capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(outside.exists())
        self.assertTrue(link.is_symlink())

    def test_certbot_links_matching_versions_and_preserves_other_archives(self):
        live = self.root / "live/npm-1"
        archive = self.root / "archive/npm-1"
        live.mkdir(parents=True)
        archive.mkdir(parents=True)
        (live / "fullchain.pem").write_text("current-cert")
        (live / "privkey.pem").write_text("unmatched-key")
        for version, content in [(9, "current-cert"), (10, "current-cert"), (11, "different-cert")]:
            (archive / f"fullchain{version}.pem").write_text(content)
        result = self.shell('relink_certbot_certificates "$1"', self.root)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(os.readlink(live / "fullchain.pem"), "../../archive/npm-1/fullchain10.pem")
        self.assertEqual((live / "fullchain.pem").read_text(), "current-cert")
        self.assertFalse((live / "privkey.pem").is_symlink())
        self.assertEqual((live / "privkey.pem").read_text(), "unmatched-key")
        self.assertEqual(len(list(archive.glob("*.pem"))), 3)

    def test_failed_atomic_link_does_not_replace_live_certificate(self):
        live, archive = self.root / "live/npm-2", self.root / "archive/npm-2"
        live.mkdir(parents=True)
        archive.mkdir(parents=True)
        (live / "cert.pem").write_text("certificate")
        (archive / "cert1.pem").write_text("certificate")
        result = self.shell('ln() { return 1; }; relink_certbot_certificates "$1"', self.root)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((live / "cert.pem").is_symlink())
        self.assertEqual((live / "cert.pem").read_text(), "certificate")

    def test_certbot_relink_recovers_with_stale_temporary_links(self):
        live, archive = self.root / "live/npm-2", self.root / "archive/npm-2"
        live.mkdir(parents=True)
        archive.mkdir(parents=True)
        (live / "cert.pem").write_text("certificate")
        (archive / "cert1.pem").write_text("certificate")
        (live / "cert.pem.shieldpm-link").symlink_to("stale")
        result = self.shell('relink_certbot_certificates "$1"', self.root)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((live / "cert.pem").is_symlink())
        self.assertEqual((live / "cert.pem").read_text(), "certificate")
        self.assertEqual(list(live.glob(".shieldpm-link.*")), [])

    def test_installer_credentials_round_trip_without_shell_execution(self):
        source = (REPO / "scripts/install.sh").read_text()
        function = source.split("set_env_value() {", 1)[1].split("\n}\n", 1)[0]
        env_file = self.root / ".env"
        env_file.write_text("TZ=UTC\n# DB_MYSQL_PASSWORD=old\nDB_MYSQL_PASSWORD=duplicate\n")
        value = 'spaces "quotes" apostrophe\' \\ & | $(touch ' + str(self.root / "injected") + ') `false`'
        program = 'set_env_value() {' + function + '\n}\nENV_FILE=$1\nset_env_value DB_MYSQL_PASSWORD "$2"\n'
        result = subprocess.run(["bash", "-c", program, "test", str(env_file), value], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        result = subprocess.run(["sh", "-c", '. "$1"; printf %s "$DB_MYSQL_PASSWORD"', "test", str(env_file)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, value)
        self.assertFalse((self.root / "injected").exists())
        self.assertEqual(env_file.stat().st_mode & 0o777, 0o600)
        self.assertEqual(env_file.read_text().count("DB_MYSQL_PASSWORD="), 1)

    def test_optional_feature_enablement_preserves_unrelated_values(self):
        installer = (REPO / "scripts/install.sh").read_text()
        function = installer.split("set_env_value() {", 1)[1].split("\n}\n", 1)[0]
        env_file = self.root / ".env"
        original = "DB_PASSWORD='ANUBIS_ENABLED NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE'\n"
        env_file.write_text(original + "# ANUBIS_ENABLED=false\n")
        program = 'set_env_value() {' + function + '\n}\nENV_FILE=$1\n'
        program += "set_env_value ANUBIS_ENABLED true\nset_env_value NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE true\n"
        result = subprocess.run(["bash", "-c", program, "test", str(env_file)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(original, env_file.read_text())
        self.assertIn("ANUBIS_ENABLED=true\n", env_file.read_text())
        updater = (REPO / "rootfs/usr/local/bin/update-shieldpm").read_text()
        branch = updater.split('                    if grep -qE ', 1)[1].split('\n                    fi', 1)[0]
        for content in (original, original + "# ANUBIS_ENABLED=false\n", original + "export ANUBIS_ENABLED=false\n"):
            env_file.write_text(content)
            program = 'ENV_FILE=$1\nif grep -qE ' + branch + '\nfi\n'
            result = subprocess.run(["bash", "-c", program, "test", str(env_file)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(original, env_file.read_text())
            self.assertEqual(env_file.read_text().count("ANUBIS_ENABLED=true"), 1)

    def run_aio(self, failure=""):
        executable = self.root / "bin"
        executable.mkdir()
        healthcheck = executable / "healthcheck.sh"
        healthcheck.write_text("#!/bin/sh\nexit 0\n")
        healthcheck.chmod(0o700)
        curl = executable / "curl"
        curl.write_text('''#!/usr/bin/env python3
import json, os, pathlib, sys
args = sys.argv[1:]
assert args[args.index("--unix-socket") + 1] == "/run/shieldpm.sock"
url = args[-1]
if url.endswith("/tokens"):
    payload = json.loads(pathlib.Path(args[args.index("--data-binary") + 1][1:]).read_text())
    assert payload["secret"] == os.environ["INITIAL_ADMIN_PASSWORD"]
    assert payload["identity"] == os.environ["INITIAL_ADMIN_EMAIL"]
    print(json.dumps({"requires_2fa": True} if os.environ["AIO_FAILURE"] == "2fa" else {"token": "test-access-token"}))
elif url == "http://localhost/":
    assert "Authorization: Bearer test-access-token" in args
    assert "-b" in args and "-c" in args
    print(json.dumps({"csrfToken": "test-csrf-token"}))
elif url.endswith("/nginx/proxy-hosts"):
    assert "Authorization: Bearer test-access-token" in args
    assert "X-XSRF-TOKEN: test-csrf-token" in args
    assert "-b" in args
    payload = json.loads(pathlib.Path(args[args.index("--data-binary") + 1][1:]).read_text())
    assert payload["access_list_id"] == 0
    assert payload["domain_names"] == [os.environ["NC_DOMAIN"]]
    sys.exit(22 if os.environ["AIO_FAILURE"] == "host" else 0)
else:
    sys.exit(22)
''')
        curl.chmod(0o700)
        script = self.root / "aio.sh"
        lock = self.root / "aio.lock"
        script.write_text((REPO / "rootfs/usr/local/bin/aio.sh").read_text().replace("/data/aio.lock", str(lock)))
        environment = {**os.environ, "PATH": f"{executable}:{os.environ['PATH']}", "NC_AIO": "true",
                       "INITIAL_ADMIN_EMAIL": "admin@example.com", "INITIAL_ADMIN_PASSWORD": "quote'\"\\$&",
                       "NC_DOMAIN": "cloud.example.com", "AIO_FAILURE": failure}
        result = subprocess.run(["sh", str(script)], env=environment, capture_output=True, text=True)
        return result, lock

    def test_aio_uses_socket_json_cookies_and_authenticated_csrf(self):
        result, lock = self.run_aio()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(lock.exists())

    def test_aio_failure_does_not_mark_setup_complete(self):
        result, lock = self.run_aio("host")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(lock.exists())

    def test_aio_rejects_pending_two_factor_login(self):
        result, lock = self.run_aio("2fa")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("two-factor authentication", result.stderr)
        self.assertFalse(lock.exists())

    def test_all_shell_sources_parse(self):
        for directory in (REPO / "scripts", REPO / "rootfs/usr/local/bin"):
            for path in directory.iterdir():
                if not path.is_file() or path.is_symlink():
                    continue
                first_line = path.read_text().splitlines()[0]
                if not first_line.startswith("#!") or not ("sh" in first_line):
                    continue
                shell = "bash" if "bash" in first_line else "sh"
                with self.subTest(path=str(path.relative_to(REPO))):
                    result = subprocess.run([shell, "-n", str(path)], capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)

    def test_documented_shell_env_values_can_be_uncommented(self):
        source = (REPO / "rootfs/.env.example").read_text()
        keys = ("GOACLA", "PHP82_APKS", "PHP83_APKS", "PHP84_APKS", "INITIAL_ADMIN_EMAIL", "INITIAL_ADMIN_PASSWORD")
        example = "\n".join(line[2:] for line in source.splitlines() if any(line.startswith(f"# {key}=") for key in keys))
        result = subprocess.run(["sh", "-e", "-c", example + '\nprintf "%s\\n" "$PHP84_APKS" "$INITIAL_ADMIN_EMAIL"'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "php8.4-curl php8.4-openssl\n<initial@email.tld>\n")
        self.assertEqual(source, (REPO / "rootfs/data/.env").read_text())

    @unittest.skipUnless(shutil.which("ssh-keygen"), "OpenSSH client required")
    def test_lxc_clones_generate_unique_host_keys_before_ssh_starts(self):
        unit = (REPO / "rootfs/usr/lib/systemd/system/shieldpm-ssh-hostkeys.service").read_text()
        self.assertIn("Before=ssh.service", unit)
        self.assertIn("WantedBy=ssh.service", unit)
        command = shlex.split(next(line.removeprefix("ExecStart=") for line in unit.splitlines() if line.startswith("ExecStart=")))
        template = self.root / "template"
        ssh_directory = template / "etc/ssh"
        ssh_directory.mkdir(parents=True)
        for name in ("ssh_host_rsa_key", "ssh_host_ed25519_key", "ssh_host_ed25519_key.pub"):
            (ssh_directory / name).write_text("shared template identity")
        (ssh_directory / "sshd_config").write_text("Port 22\n")
        workflow = (REPO / ".github/workflows/docker.yml").read_text()
        cleanup = next(line.strip() for line in workflow.splitlines() if "sh -c 'rm -f /etc/ssh/ssh_host_*'" in line)
        cleanup = cleanup.replace('docker exec "$CONTAINER_NAME" ', "").replace("/etc/ssh/", str(ssh_directory) + "/")
        subprocess.run(["sh", "-eu", "-c", cleanup], check=True)
        self.assertEqual([p.name for p in ssh_directory.iterdir()], ["sshd_config"])
        identities = []
        for number in range(2):
            clone = self.root / f"clone-{number}"
            shutil.copytree(template, clone)
            subprocess.run([*command, "-f", str(clone)], check=True, capture_output=True)
            key = clone / "etc/ssh/ssh_host_ed25519_key.pub"
            identities.append(key.read_text())
            # The unit is idempotent and must preserve keys on subsequent boots.
            subprocess.run([*command, "-f", str(clone)], check=True, capture_output=True)
            self.assertEqual(key.read_text(), identities[-1])
        self.assertNotEqual(*identities)


if __name__ == "__main__":
    unittest.main()
