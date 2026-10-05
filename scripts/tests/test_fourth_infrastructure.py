"""Exercise native reinstall and optional installer failures in isolated fixtures."""

import os
from pathlib import Path
import re
import shlex
import shutil
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

    def environment_helper(self, name, *arguments):
        function = name + "() {" + self.installer.split(name + "() {", 1)[1].split("\n}\n", 1)[0] + "\n}\n"
        return subprocess.run(["bash", "-eu", "-c", function +
            f'ENV_FILE=$1; shift; {name} "$@"', "test", str(self.root / ".env"), *arguments],
            env={"PATH": os.environ["PATH"]}, capture_output=True, text=True)

    def validate_sourced_environment(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is required for the real startup validator")
        validator = self.root / "validate-env.cjs"
        validator.write_text((REPO / "backend/validate-env.cjs").read_text().replace(
            "/data/", f"{self.root}/data/"))
        # Use the actual envs.sh export/source phase without running services,
        # downloading databases, or reading a host installation's /data.
        source = (REPO / "rootfs/usr/local/bin/envs.sh").read_text()
        phase = "set -a\n" + source.split("set -a\n", 1)[1].split("set +a", 1)[0] + "set +a\n"
        phase = phase.replace(". /data/.env", '. "$1"')
        return subprocess.run(["sh", "-eu", "-c", phase + 'exec "$2" "$3"',
            "test", str(self.root / ".env"), node, str(validator)],
            env={"PATH": os.environ["PATH"]}, capture_output=True, text=True)

    def sourced_value(self, key):
        self.assertRegex(key, r"^[A-Za-z_][A-Za-z0-9_]*$")
        result = subprocess.run(["sh", "-eu", "-c", f'. "$1"; printf %s "${{{key}}}"',
            "test", str(self.root / ".env"), key], env={"PATH": os.environ["PATH"]},
            capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def test_multiline_database_values_survive_every_provider_transition_and_real_validation(self):
        env_file = self.root / ".env"
        unrelated = "# Existing configuration\r\nTZ=UTC\nGEOIP_AUTO_UPDATE=false\n" + \
            "SENTINEL='first\nDB_POSTGRES_HOST=inside-value\n# literal comment\nlast'\n"
        original = unrelated + "  export DB_MYSQL_HOST=mysql.example # preserve inline comment\n" + \
            "DB_MYSQL_PASSWORD='first\nsecond'\n" + \
            '# export DB_POSTGRES_HOST=postgres.example\n# DB_POSTGRES_PASSWORD="one\n# two"\n' + \
            "# DB_SQLITE_FILE='/data/old\n# path.sqlite'\n"
        for previous in ("MYSQL", "POSTGRES", "SQLITE"):
            for selected in ("MYSQL", "POSTGRES", "SQLITE"):
                with self.subTest(previous=previous, selected=selected):
                    env_file.write_bytes(original.encode())
                    for provider in (previous, selected, previous, selected):
                        result = self.environment_helper("configure_database_environment", provider)
                        self.assertEqual(result.returncode, 0, result.stderr)
                        result = self.validate_sourced_environment()
                        self.assertEqual(result.returncode, 0, result.stderr)
                        self.assertTrue(env_file.read_bytes().startswith(unrelated.encode()))
                    if selected == "MYSQL":
                        self.assertEqual(self.sourced_value("DB_MYSQL_PASSWORD"), "first\nsecond")
                    elif selected == "POSTGRES":
                        self.assertEqual(self.sourced_value("DB_POSTGRES_PASSWORD"), "one\ntwo")

    def test_database_literal_quotes_escapes_and_continuations_round_trip(self):
        env_file = self.root / ".env"
        cases = [("'one\ntwo'", "one\ntwo"), ('"one\ntwo"', "one\ntwo"),
                 (shlex.quote("apostrophe'\\\nlast"), "apostrophe'\\\nlast"),
                 ('"escaped \\"quote\\" and \\$literal"', 'escaped "quote" and $literal'),
                 ("first\\\nsecond", "firstsecond"), ("#literal", "#literal"),
                 ("normal", "normal"), ("", "")]
        for literal, expected in cases:
            with self.subTest(literal=literal):
                env_file.write_text("TZ=UTC\nGEOIP_AUTO_UPDATE=false\n  export DB_MYSQL_HOST=mysql.example\n" +
                    "  export DB_MYSQL_PASSWORD=" + literal + " # retained comment\n")
                for provider in ("SQLITE", "MYSQL"):
                    result = self.environment_helper("configure_database_environment", provider)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    result = self.validate_sourced_environment()
                    self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(self.sourced_value("DB_MYSQL_PASSWORD"), expected)

    def test_set_environment_value_replaces_complete_active_and_commented_spans(self):
        env_file = self.root / ".env"
        unrelated = "# retained CRLF comment\r\nTZ=UTC\nGEOIP_AUTO_UPDATE=false\n" + \
            "DB_MYSQL_HOST=mysql.example\nSENTINEL='DB_MYSQL_PASSWORD=inside\nsecond'\n"
        old_values = ["DB_MYSQL_PASSWORD=old\n", "export DB_MYSQL_PASSWORD='old\nvalue'\n",
                      '# DB_MYSQL_PASSWORD="old\n# value"\n',
                      "  # export DB_MYSQL_PASSWORD='old'\\''\n  # value'\n"]
        for old in old_values:
            for value in ("normal", "first\nDB_POSTGRES_HOST=literal\nlast'\\\"$`", ""):
                with self.subTest(old=old, multiline="\n" in value):
                    env_file.write_bytes((unrelated + old).encode())
                    result = self.environment_helper("set_env_value", "DB_MYSQL_PASSWORD", value)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertTrue(env_file.read_bytes().startswith(unrelated.encode()))
                    result = self.validate_sourced_environment()
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertEqual(self.sourced_value("DB_MYSQL_PASSWORD"), value)
                    self.assertEqual(env_file.stat().st_mode & 0o777, 0o600)
                    # A newly quoted multiline value must remain editable by
                    # subsequent setters and reversible provider changes.
                    result = self.environment_helper("set_env_value", "GEOIP_AUTO_UPDATE", "false")
                    self.assertEqual(result.returncode, 0, result.stderr)
                    for provider in ("SQLITE", "MYSQL"):
                        result = self.environment_helper("configure_database_environment", provider)
                        self.assertEqual(result.returncode, 0, result.stderr)
                    result = self.validate_sourced_environment()
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertEqual(self.sourced_value("DB_MYSQL_PASSWORD"), value)

    def test_unsupported_or_unbalanced_environment_never_changes_file(self):
        env_file = self.root / ".env"
        cases = ["DB_MYSQL_PASSWORD='unfinished\n", 'DB_MYSQL_PASSWORD="unfinished\n',
                 "SENTINEL='unfinished\nDB_MYSQL_PASSWORD=value\n", "DB_MYSQL_PASSWORD=first\\\n",
                 "DB_MYSQL_PASSWORD=one second\n", "DB_MYSQL_PASSWORD=one \\ second\n",
                 "export DB_MYSQL_PASSWORD=value OTHER=value\n", "DB_MYSQL_PASSWORD=$(false)\n",
                 'SENTINEL="$HOME"\n', "DB_MYSQL_PASSWORD=`false`\n", "DB_MYSQL_PASSWORD=value; false\n",
                 "DB_MYSQL_PASSWORD = value\n", "false\n",
                 "# DB_MYSQL_PASSWORD='first\nsecond'\n", "# DB_MYSQL_PASSWORD='unfinished\n"]
        for content in cases:
            for name, arguments in [("set_env_value", ("DB_MYSQL_PASSWORD", "replacement")),
                                    ("configure_database_environment", ("SQLITE",))]:
                with self.subTest(content=content, helper=name):
                    original = ("TZ=UTC\n" + content).encode()
                    env_file.write_bytes(original)
                    before = env_file.stat()
                    result = self.environment_helper(name, *arguments)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertEqual(env_file.read_bytes(), original)
                    self.assertEqual(env_file.stat().st_ino, before.st_ino)
                    self.assertEqual(list(self.root.glob(".shieldpm-env-*")), [])

    def test_provider_edit_preserves_unrelated_bytes_and_missing_final_newline(self):
        env_file = self.root / ".env"
        prefix = "# untouched\r\nTZ=UTC\nGEOIP_AUTO_UPDATE=false\n"
        suffix = "SENTINEL='unchanged'"
        env_file.write_bytes((prefix + "DB_MYSQL_HOST=mysql.example\n" + suffix).encode())
        result = self.environment_helper("configure_database_environment", "SQLITE")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(env_file.read_bytes(), (prefix + "# DB_MYSQL_HOST=mysql.example\n" + suffix).encode())
        result = self.environment_helper("set_env_value", "DB_MYSQL_HOST", "mysql.example")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(env_file.read_bytes(), (prefix + suffix + "\nDB_MYSQL_HOST=mysql.example\n").encode())
        result = self.validate_sourced_environment()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_standalone_helpers_use_identical_literal_parser(self):
        parsers = re.findall(r"# Keep this literal-only parser identical.*?(?=\nif |\nprovider =)",
                            self.installer, re.DOTALL)
        self.assertEqual(len(parsers), 2)
        self.assertEqual(parsers[0], parsers[1])

    def test_optional_service_restart_loops_wait_after_process_exit(self):
        source = (REPO / "rootfs/usr/local/bin/launch.sh").read_text()
        programs = [line.rstrip(" &") for line in source.splitlines()
                    if line.startswith('if [ "$PHP') and "then while true;" in line]
        source_lines = source.splitlines()
        goaccess_start = next(index for index, line in enumerate(source_lines)
                            if line.startswith('if [ "$GOA" = "true" ]; then while true;'))
        goaccess_end = next(index for index in range(goaccess_start, len(source_lines))
                           if source_lines[index].rstrip().endswith("fi &"))
        programs.append("\n".join(source_lines[goaccess_start:goaccess_end + 1]).rstrip(" &"))
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
                         "rootfs/usr/local/bin/start.sh", "rootfs/usr/local/bin/update-geoip.py"):
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

    def test_default_geoip_setup_never_prompts_for_credentials_or_changes_custom_updates(self):
        section = self.installer.split("# 12. Shared GeoIP databases", 1)[1].split("\n", 1)[1].split("# 13.", 1)[0]
        etc = self.root / "etc"
        (etc / "cron.d").mkdir(parents=True)
        configuration, cron = etc / "GeoIP.conf", etc / "cron.d/geoipupdate"
        configuration.write_text("custom provider configuration\n")
        cron.write_text("custom update schedule\n")
        env_file = self.root / ".env"
        env_file.write_text("GEOIP_AUTO_UPDATE=false\n")
        original = {filename: filename.read_bytes() for filename in (configuration, cron, env_file)}
        program = "read() { echo unexpected-credential-prompt >&2; exit 72; };\n" + section.replace("/etc/", f"{etc}/")
        result = subprocess.run(["bash", "-e", "-c", program], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("No MaxMind account", result.stdout)
        self.assertIn("Existing MaxMind configuration and update jobs have been retained", result.stdout)
        for filename, content in original.items():
            self.assertEqual(filename.read_bytes(), content)

    def test_native_health_window_allows_geoip_preparation_and_backend_startup(self):
        section = self.installer.split('echo "--> Waiting for the backend', 1)[1].split("\n", 1)[1].split('echo "=== Installation Complete', 1)[0]
        fixture = '''
curl() { ((SECONDS >= 242)) && printf '{"status":"OK"}'; }
jq() { body=$(cat); [[ "$body" == '{"status":"OK"}' ]]; }
sleep() { if ((SECONDS == 0)); then SECONDS=241; else SECONDS=$((SECONDS + 1)); fi; }
SECONDS=0
'''
        result = subprocess.run(["bash", "-e", "-c", fixture + section + '\nprintf "deadline=%s elapsed=%s" "$INSTALL_HEALTH_DEADLINE" "$SECONDS"'],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("deadline=360", result.stdout)
        self.assertIn("elapsed=242", result.stdout)

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
                expected = {"postgres": "|selected||UTC", "mysql": "selected|||UTC", "sqlite": "|||UTC"}
                self.assertEqual(result.stdout, expected[selected])

    def test_legacy_sqlite_path_stays_disabled_through_provider_switches_and_validation(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is required for the real startup validator")
        env_file = self.root / ".env"
        validator = self.root / "validate-env.cjs"
        # Redirect only filesystem discovery; run the production validation
        # without reading any host's /data files or starting external services.
        validator.write_text((REPO / "backend/validate-env.cjs").read_text().replace(
            "/data/", f"{self.root}/data/"))
        helper = "configure_database_environment() {" + self.installer.split(
            "configure_database_environment() {", 1)[1].split("\n}\n", 1)[0] + "\n}\n"
        unrelated = ["TZ=UTC", "GEOIP_AUTO_UPDATE=false",
                     "SENTINEL='keep spaces # = $'", "# Existing installation"]
        for legacy in ("DB_SQLITE_FILE=/data/custom.sqlite",
                       "# DB_SQLITE_FILE=/data/custom.sqlite",
                       "  export DB_SQLITE_FILE=/data/custom.sqlite",
                       "  # export DB_SQLITE_FILE=/data/custom.sqlite"):
            env_file.write_text("\n".join(unrelated + [legacy,
                "DB_MYSQL_HOST=mysql.example", "DB_POSTGRES_HOST=postgres.example"]) + "\n")
            for selected in ("MYSQL", "SQLITE", "POSTGRES", "SQLITE"):
                with self.subTest(legacy=legacy, selected=selected):
                    result = subprocess.run(["bash", "-eu", "-c",
                        helper + 'ENV_FILE=$1; configure_database_environment "$2"',
                        "test", str(env_file), selected],
                        env={"PATH": os.environ["PATH"]}, capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    result = subprocess.run(["sh", "-eu", "-c",
                        'set -a; . "$1"; exec "$2" "$3"', "test",
                        str(env_file), node, str(validator)],
                        env={"PATH": os.environ["PATH"]}, capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    updated = env_file.read_text().splitlines()
                    for line in unrelated:
                        self.assertIn(line, updated)
                    self.assertIn("/data/custom.sqlite", env_file.read_text())


if __name__ == "__main__":
    unittest.main()
