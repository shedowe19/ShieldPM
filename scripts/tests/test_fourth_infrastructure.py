"""Exercise native reinstall and optional installer failures in isolated fixtures."""

import io
import os
from pathlib import Path
import subprocess
import tarfile
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

    def test_native_installer_uses_agent_helper_and_stops_on_failure(self):
        branch = self.installer.split("# 15. OpenAppSec WAF (Optional)", 1)[1].split(
            'echo "=== Starting ShieldPM ==="', 1)[0]
        executable = self.root / "shieldpm-openappsec-agent-install"
        executable.write_text("#!/bin/sh\necho invoked > helper-called\nexit 43\n")
        executable.chmod(0o700)
        branch = branch.replace("/usr/local/bin/shieldpm-openappsec-agent-install", str(executable))
        result = subprocess.run(["bash", "-e", "-c", branch], cwd=self.root, input="y\n",
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 43, result.stdout + result.stderr)
        self.assertTrue((self.root / "helper-called").exists())
        self.assertNotIn("open-appsec-install --auto", branch)

    def make_agent_fixture(self):
        """Execute the actual helper with disposable paths and inert command shims."""
        source = (REPO / "rootfs/usr/local/bin/shieldpm-openappsec-agent-install").read_text()
        nginx_root = self.root / "native-nginx"
        nginx_binary = nginx_root / "sbin/nginx"
        nginx_binary.parent.mkdir(parents=True)
        nginx_binary.write_text("#!/bin/sh\necho nginx >> \"$OAS_TEST_LOG\"\nexit ${OAS_NGINX_EXIT:-0}\n")
        nginx_binary.chmod(0o700)
        nginx_conf = nginx_root / "conf/nginx.conf"
        nginx_conf.parent.mkdir(parents=True)
        module = self.root / "libngx_module.so"
        module.write_bytes(b"fixture")
        nginx_conf.write_text(f"#load_module {module};\nevents {{}}\nhttp {{}}\n")
        policy_template = self.root / "policy-template.yaml"
        policy_template.write_text("version: v1beta1\n")
        (self.root / "os-release").write_text('ID=debian\nVERSION_ID="13"\n')
        env_file = self.root / "data/.env"
        env_file.parent.mkdir()
        env_file.write_text("TZ=UTC\nNGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=false\n")
        substitutions = {
            'if [ "$EUID" -ne 0 ]; then': 'if false; then',
            "/etc/os-release": str(self.root / "os-release"),
            "/usr/local/nginx/": f"{nginx_root}/",
            "/data/.env": str(env_file),
            "/usr/local/share/shieldpm/openappsec-local-policy.yaml": str(policy_template),
            "/etc/cp/conf": str(self.root / "cp/conf"),
            "/advanced-model": str(self.root / "advanced-model"),
        }
        for old, new in substitutions.items():
            self.assertIn(old, source)
            source = source.replace(old, new)
        helper = self.root / "agent-helper"
        helper.write_text(source)
        helper.chmod(0o700)

        archive = self.root / "upstream.tar.gz"
        names = ("install-cp-nano-agent.sh", "install-cp-nano-service-http-transaction-handler.sh",
                 "install-cp-nano-attachment-registration-manager.sh")
        with tarfile.open(archive, "w:gz") as bundle:
            for name in names:
                payload = ("#!/bin/sh\n"
                           'printf "%s|%s\\n" "' + name + '" "$*" >> "$OAS_TEST_LOG"\n'
                           '[ "${OAS_FAIL_COMPONENT:-}" != "' + name + '" ]\n').encode()
                info = tarfile.TarInfo(f"openappsec/{name}")
                info.mode = 0o755
                info.size = len(payload)
                bundle.addfile(info, io.BytesIO(payload))

        shim_dir = self.root / "bin"
        shim_dir.mkdir()
        curl_shim = shim_dir / "curl"
        curl_shim.write_text('#!/bin/bash\n'
                             'printf "curl %s\\n" "$*" >> "$OAS_TEST_LOG"\n'
                             'while [ "$#" -gt 0 ]; do\n'
                             '  if [ "$1" = "-o" ]; then cp "$OAS_ARCHIVE" "$2"; exit 0; fi\n'
                             '  shift\n'
                             'done\nexit 44\n')
        curl_shim.chmod(0o700)
        systemctl_shim = shim_dir / "systemctl"
        systemctl_shim.write_text('#!/bin/sh\nprintf "systemctl %s\\n" "$*" >> "$OAS_TEST_LOG"\n'
                                   '[ "$1" = "is-active" ] && [ "${OAS_SYSTEMCTL_ACTIVE:-}" = 1 ] && exit 0\n'
                                   '[ "$1" = "is-active" ] && exit 3\n'
                                   '[ "$1" = "restart" ] && exit ${OAS_RESTART_EXIT:-0}\n'
                                   'exit 45\n')
        systemctl_shim.chmod(0o700)
        ctl_shim = shim_dir / "open-appsec-ctl"
        ctl_shim.write_text('#!/bin/sh\nprintf "ctl %s\\n" "$*" >> "$OAS_TEST_LOG"\n'
                            '[ "$1" = "--status" ] && printf "Status: Running\\n"\n'
                            'exit ${OAS_CTL_EXIT:-0}\n')
        ctl_shim.chmod(0o700)
        apt_shim = shim_dir / "apt-get"
        apt_shim.write_text('#!/bin/sh\necho "apt-get $*" >> "$OAS_TEST_LOG"\nexit 46\n')
        apt_shim.chmod(0o700)
        uname_shim = shim_dir / "uname"
        uname_shim.write_text('#!/bin/sh\nprintf "x86_64\\n"\n')
        uname_shim.chmod(0o700)
        log = self.root / "calls"
        env = {**os.environ, "PATH": f"{shim_dir}:{os.environ['PATH']}",
               "OAS_TEST_LOG": str(log), "OAS_ARCHIVE": str(archive)}
        return helper, env_file, log, env, names

    def test_openappsec_component_failure_keeps_attachment_disabled(self):
        helper, env_file, log, env, names = self.make_agent_fixture()
        for failed in (names[0], names[2]):
            with self.subTest(failed=failed):
                env_file.write_text("TZ=UTC\nNGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=false\n")
                log.unlink(missing_ok=True)
                result = subprocess.run([str(helper)], cwd=self.root, input="\n\n", timeout=10,
                                        env={**env, "OAS_FAIL_COMPONENT": failed},
                                        capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertIn("NGINX setting was not changed", result.stderr)
                self.assertIn("NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=false", env_file.read_text())
                self.assertNotIn("NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true", env_file.read_text())
                self.assertEqual([line.split("|", 1)[0] for line in log.read_text().splitlines()
                                  if line.split("|", 1)[0] in names],
                                 list(names[:names.index(failed) + 1]))

    def test_openappsec_agent_only_flow_runs_three_installers_without_apt_nginx(self):
        helper, env_file, log, env, names = self.make_agent_fixture()
        result = subprocess.run([str(helper)], cwd=self.root, input="\n\n", timeout=10,
                                env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        lines = log.read_text().splitlines()
        self.assertEqual([line.split("|", 1)[0] for line in lines if line.split("|", 1)[0] in names],
                         list(names))
        self.assertIn("--hybrid_mode", next(line for line in lines if line.startswith(names[0])))
        self.assertIn("ctl --apply-policy", lines)
        self.assertIn("nginx", lines)
        self.assertFalse(any(line.startswith("apt-get") for line in lines), lines)
        self.assertEqual(env_file.read_text().count("NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true"), 1)
        self.assertNotIn("NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=false", env_file.read_text())

    def test_openappsec_cloud_flow_skips_local_policy(self):
        helper, env_file, log, env, names = self.make_agent_fixture()
        result = subprocess.run([str(helper)], cwd=self.root, input="fixture-token\n\n", timeout=10,
                                env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        lines = log.read_text().splitlines()
        self.assertEqual([line.split("|", 1)[0] for line in lines if line.split("|", 1)[0] in names],
                         list(names))
        self.assertIn("--token fixture-token", next(line for line in lines if line.startswith(names[0])))
        self.assertNotIn("ctl --apply-policy", lines)
        self.assertFalse((self.root / "cp/conf/local_policy.yaml").exists())
        self.assertIn("NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true", env_file.read_text())

    def test_openappsec_failed_service_restart_restores_previous_setting(self):
        helper, env_file, log, env, _ = self.make_agent_fixture()
        original = env_file.read_bytes()
        result = subprocess.run([str(helper)], cwd=self.root, input="\n\n", timeout=10,
                                env={**env, "OAS_SYSTEMCTL_ACTIVE": "1", "OAS_RESTART_EXIT": "47"},
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("previous configuration was restored", result.stderr)
        self.assertEqual(env_file.read_bytes(), original)
        self.assertEqual(log.read_text().count("systemctl restart shieldpm.service"), 2)

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
