"""Exercise native reinstall and optional installer failures in isolated fixtures."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest

REPO = Path(os.environ.get("INFRA_SOURCE_ROOT", Path(__file__).resolve().parents[2]))


class FourthInfrastructureTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.installer = (REPO / "scripts/install.sh").read_text()

    def test_optional_service_restart_loops_wait_after_process_exit(self):
        source = (REPO / "rootfs/usr/local/bin/launch.sh").read_text()
        programs = [line.rstrip(" &") for line in source.splitlines()
                    if line.startswith('if [ "$PHP') and "then while true;" in line]
        goaccess = source.split('if [ "$GOA" = "true" ]; then while true;', 1)[1].split('\nwhile true; do nginx', 1)[0]
        programs.append(('if [ "$GOA" = "true" ]; then while true;' + goaccess).rstrip(" &"))
        log_file = self.root / "access.log"
        log_file.touch()
        executable = self.root / "bin"
        executable.mkdir()
        for name in ("php-fpm8.2", "php-fpm8.3", "php-fpm8.4", "goaccess"):
            path = executable / name
            path.write_text("#!/bin/sh\nexit 43\n")
            path.chmod(0o700)
        for number, program in enumerate(programs):
            with self.subTest(service=number):
                # A fake sleep exits the restart loop as soon as it yields;
                # immediate-crash loops in the old launcher time out instead.
                fixture = 'sleep() { echo "restart delayed"; exit 0; }; tail() { :; }; '
                result = subprocess.run(["sh", "-c", fixture + program.replace("/data/nginx/json_access.log", str(log_file))],
                                        env={**os.environ, "PATH": f"{executable}:{os.environ['PATH']}",
                                             "PHP82": "true", "PHP83": "true", "PHP84": "true", "GOA": "true"},
                                        capture_output=True, text=True, timeout=2)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout, "restart delayed\n")

    def test_installer_validates_its_package_before_system_changes(self):
        preamble = self.installer.split("enable_node_system_ca() {", 1)[0]
        # This fixture only exercises package discovery, not authorization; it
        # must also run as the ordinary GitHub Actions user.
        preamble = preamble.replace('if [ "$EUID" -ne 0 ]; then\n  echo "Please run as root"\n  exit 1\nfi', "")
        script = self.root / "install.sh"
        script.write_text(preamble + '\nprintf "SOURCE=%s" "$PWD"\n')
        # Missing release artifacts must be diagnosed before apt or service work.
        result = subprocess.run(["bash", str(script)], cwd="/tmp", capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("package", result.stdout + result.stderr)
        for filename in ("app/package.json", "html/frontend/index.html", "usr/local/nginx/sbin/nginx",
                         "rootfs/usr/local/bin/start.sh"):
            path = self.root / filename
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("packaged artifact")
        result = subprocess.run(["bash", str(script)], cwd="/tmp", capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(f"SOURCE={self.root}", result.stdout)

    def test_reinstall_stops_existing_service_before_replacing_binaries(self):
        program = self.installer.split("# 3. Copy Pre-built Binaries", 1)[1].split("# 4. Copy Application Files", 1)[0]
        program = "# 3. Copy Pre-built Binaries" + program
        (self.root / "usr").mkdir()
        fixture = '''
active=true
systemctl() {
    case "$1" in
        cat) return 0 ;;
        is-active) return 3 ;;
        stop) active=false ;;
        *) return 70 ;;
    esac
}
cp() { [ "$active" = false ] || { echo "service still serving old code" >&2; return 71; }; }
'''
        result = subprocess.run(["bash", "-e", "-c", fixture + program], cwd=self.root, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_openappsec_failure_does_not_continue_as_success(self):
        branch = self.installer.split("    # Run installer", 1)[1].split("    # Ask about Advanced ML Model", 1)[0]
        branch = "    # Run installer" + branch
        branch = branch.replace("/etc/cp", str(self.root / "configuration"))
        executable = self.root / "open-appsec-install"
        executable.write_text("#!/bin/sh\necho call >> calls\nexit 43\n")
        executable.chmod(0o700)
        for token in ("", "test-token"):
            with self.subTest(cloud=bool(token)):
                result = subprocess.run(["bash", "-e", "-c", branch], cwd=self.root,
                                        env={**os.environ, "OAS_AGENT_TOKEN": token}, capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertNotIn("Connected to Cloud Portal", result.stdout)
                self.assertFalse((self.root / "configuration/conf/local_policy.yaml").exists())

    def test_database_selection_disables_exported_previous_provider(self):
        # Execute the actual configuration part of each case, with server setup excluded.
        env_file = self.root / ".env"
        helper = ""
        if "configure_database_environment() {" in self.installer:
            helper = "configure_database_environment() {" + self.installer.split("configure_database_environment() {", 1)[1].split("\n}\n", 1)[0] + "\n}\n"
        setter = "set_env_value() {" + self.installer.split("set_env_value() {", 1)[1].split("\n}\n", 1)[0] + "\n}\n"
        case = self.installer.split('case "$db_choice" in', 1)[1].split("\nesac", 1)[0]
        branches = {
            "postgres": case.split("    3)", 1)[1].split("        # Update .env", 1)[1].split("        ;;", 1)[0],
            "mysql": case.split("    2)", 1)[1].split("        # Update .env", 1)[1].split("        ;;", 1)[0],
            "sqlite": case.split("    *)", 1)[1].split("        ;;", 1)[0],
        }
        for selected, branch in branches.items():
            with self.subTest(selected=selected):
                env_file.write_text("export DB_MYSQL_HOST=old-mysql\n  DB_POSTGRES_HOST=old-postgres\n# DB_SQLITE_FILE=/data/custom.sqlite\nTZ=UTC\n")
                program = helper + setter + 'ENV_FILE=$1; DB_HOST=selected; DB_PORT=5432; DB_USER=user; DB_PASS=pass; DB_NAME=app\n' + branch
                result = subprocess.run(["bash", "-e", "-c", program, "test", str(env_file)], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                result = subprocess.run(["sh", "-c", '. "$1"; printf "%s|%s|%s|%s" "${DB_MYSQL_HOST:-}" "${DB_POSTGRES_HOST:-}" "${DB_SQLITE_FILE:-}" "$TZ"', "test", str(env_file)], capture_output=True, text=True)
                expected = {"postgres": "|selected||UTC", "mysql": "selected|||UTC", "sqlite": "||/data/custom.sqlite|UTC"}
                self.assertEqual(result.stdout, expected[selected])


if __name__ == "__main__":
    unittest.main()
