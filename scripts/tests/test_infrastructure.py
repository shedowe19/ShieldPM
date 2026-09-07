"""Exercise migration and configuration helpers in temporary directories only."""

import os
from pathlib import Path
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


if __name__ == "__main__":
    unittest.main()
