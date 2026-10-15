"""Exercise the updater's original .env mutation and database recovery blocks."""

import json
import os
from pathlib import Path
import shlex
import sqlite3
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[2]
UPDATER = (REPO / "rootfs/usr/local/bin/update-shieldpm").read_text()


class EnvironmentMaintenanceTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        (self.root / "data/shieldpm").mkdir(parents=True)
        (self.root / "run/binaries").mkdir(parents=True)
        self.env_file = self.root / "data/.env"
        self.database = self.root / "data/shieldpm/database.sqlite"
        with sqlite3.connect(self.database) as database:
            database.execute("CREATE TABLE recovery (value TEXT)")
            database.execute("INSERT INTO recovery VALUES ('committed data')")

    def run_function(self, name, *, input_text=""):
        function = name + "() {" + UPDATER.split(name + "() {", 1)[1].split("\n}\n", 1)[0] + "\n}\n"
        # The only side effect redirected in Anubis activation is installing
        # its fixture binary; the real .env helper and shell block execute.
        mocks = "install() { :; }; ldconfig() { :; };\n"
        return subprocess.run(["bash", "-euo", "pipefail", "-c", function + mocks +
                               'UPDATE_RUN_DIR=$1; TEMP_DIR=$2; BACKEND_DIR=$3; STAGED_NGINX=false; '
                               'STAGED_ANUBIS=true; ANUBIS_INSTALLED=false; STAGED_OAUTH2=false; ' + name,
                               "fixture", str(self.root / "run"), str(REPO), str(self.root / "app")],
                              input=input_text, capture_output=True, text=True, timeout=10,
                              env={**os.environ, "DATA_PATH": str(self.root / "data")})

    def test_anubis_enablement_preserves_complete_password_bytes_and_literal_pseudo_keys(self):
        password = "one\r\nANUBIS_ENABLED=false\nDB_MYSQL_HOST=literal\nlast'\\\"$`\n"
        original = "# untouched\r\nDB_MYSQL_PASSWORD=" + shlex.quote(password) + "\n"
        for assignment in ("", "# ANUBIS_ENABLED=false\n", 'export ANUBIS_ENABLED="fal\nse"\n'):
            with self.subTest(assignment=assignment):
                self.env_file.write_bytes((original + assignment).encode())
                result = self.run_function("apply_staged_native_binaries")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertTrue(self.env_file.read_bytes().startswith(original.encode()))
                sourced = subprocess.run(["sh", "-eu", "-c", '. "$1"; printf %s "$DB_MYSQL_PASSWORD"',
                                         "fixture", str(self.env_file)], capture_output=True)
                self.assertEqual(sourced.returncode, 0, sourced.stderr)
                self.assertEqual(sourced.stdout, password.encode())
                self.assertTrue(self.env_file.read_bytes().endswith(b"ANUBIS_ENABLED=true\n"))
                self.assertEqual(self.env_file.stat().st_mode & 0o777, 0o600)

    def test_recovery_does_not_treat_password_lines_as_external_database_assignments(self):
        self.env_file.write_text("DB_PASSWORD='first\nDB_MYSQL_HOST=literal\nDB_POSTGRES_HOST=literal\nlast'\n")
        result = self.run_function("confirm_database_recovery_checkpoint")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("SQLite recovery snapshot created", result.stdout)
        snapshot = self.root / "run/database-backup.sqlite"
        with sqlite3.connect(snapshot) as database:
            self.assertEqual(database.execute("SELECT value FROM recovery").fetchall(), [("committed data",)])
        self.assertIn("database_kind=sqlite", (self.root / "run/database-backup-checkpoint").read_text())
        self.assertEqual(snapshot.stat().st_mode & 0o777, 0o600)

    def test_real_external_provider_requires_explicit_backup_confirmation(self):
        for provider in ("MYSQL", "POSTGRES"):
            with self.subTest(provider=provider):
                self.env_file.write_text("".join(f"export DB_{provider}_{field}={value}\n" for field, value in
                                                (("HOST", "db.example"), ("USER", "user"), ("NAME", "shieldpm"))))
                rejected = self.run_function("confirm_database_recovery_checkpoint", input_text="n")
                self.assertNotEqual(rejected.returncode, 0)
                self.assertFalse((self.root / "run/database-backup.sqlite").exists())
                accepted = self.run_function("confirm_database_recovery_checkpoint", input_text="y")
                self.assertEqual(accepted.returncode, 0, accepted.stderr)
                self.assertIn("database_kind=external", (self.root / "run/database-backup-checkpoint").read_text())

    def test_quoted_empty_or_last_empty_host_does_not_select_external_provider(self):
        for host in ("DB_MYSQL_HOST=''\n", "DB_MYSQL_HOST=first\nDB_MYSQL_HOST=\n"):
            with self.subTest(host=host):
                self.env_file.write_text(host + "DB_MYSQL_USER=user\nDB_MYSQL_NAME=shieldpm\n")
                result = self.run_function("confirm_database_recovery_checkpoint")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("SQLite recovery snapshot created", result.stdout)

    def test_explicit_database_configuration_precedes_environment(self):
        self.env_file.write_text("DB_MYSQL_HOST=db.example\nDB_MYSQL_USER=user\nDB_MYSQL_NAME=shieldpm\n")
        config = {"database": {"engine": "knex-native", "knex": {"client": "better-sqlite3"}}}
        (self.root / "data/shieldpm/default.json").write_text(json.dumps(config))
        result = self.run_function("confirm_database_recovery_checkpoint")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("SQLite recovery snapshot created", result.stdout)

    def test_explicit_sqlite_filename_is_the_database_actually_snapshotted(self):
        custom = self.root / "app/custom.sqlite"
        custom.parent.mkdir()
        self.database.rename(custom)
        self.env_file.write_text("TZ=UTC\n")
        config = {"database": {"engine": "knex-native", "knex": {
            "client": "better-sqlite3", "connection": {"filename": "custom.sqlite"}}}}
        (self.root / "data/shieldpm/default.json").write_text(json.dumps(config))
        result = self.run_function("confirm_database_recovery_checkpoint")
        self.assertEqual(result.returncode, 0, result.stderr)
        with sqlite3.connect(self.root / "run/database-backup.sqlite") as database:
            self.assertEqual(database.execute("SELECT value FROM recovery").fetchall(), [("committed data",)])

    def test_invalid_literal_aborts_before_creating_a_checkpoint_or_changing_credentials(self):
        original = b"DB_PASSWORD='unterminated\nANUBIS_ENABLED=false\n"
        self.env_file.write_bytes(original)
        for name in ("confirm_database_recovery_checkpoint", "apply_staged_native_binaries"):
            with self.subTest(function=name):
                result = self.run_function(name)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.env_file.read_bytes(), original)
                self.assertFalse((self.root / "run/database-backup-checkpoint").exists())
                self.assertFalse((self.root / "run/database-backup.sqlite").exists())


if __name__ == "__main__":
    unittest.main()
