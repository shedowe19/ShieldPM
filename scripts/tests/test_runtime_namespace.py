"""Exercise the shared service runtime without modifying host paths or services."""

import errno
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[2]
HELPERS = REPO / "rootfs/usr/local/bin/runtime-config.sh"


class RuntimeNamespaceTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

    def shell(self, program, *args, check=True, prefix=()):
        result = subprocess.run(
            [*prefix, "sh", "-eu", "-c", '. "$1"; shift; ' + program,
             "test", str(HELPERS), *map(str, args)],
            text=True, capture_output=True,
        )
        if check:
            self.assertEqual(result.returncode, 0, result.stderr)
        return result

    def test_namespace_preparation_keeps_foreign_files_and_symlink_targets(self):
        runtime = self.root / "shieldpm"
        runtime.mkdir()
        foreign = self.root / "docker.sock"
        foreign.write_text("another service")
        before = foreign.stat()
        (runtime / "foreign-link").symlink_to(foreign)
        self.shell('prepare_runtime_directory "$1" "$2" "$3"', runtime, os.getuid(), os.getgid())
        self.assertEqual(runtime.stat().st_mode & 0o777, 0o700)
        self.assertEqual((runtime / "home").stat().st_mode & 0o777, 0o700)
        self.assertEqual(foreign.stat(), before)
        self.assertEqual(foreign.read_text(), "another service")
        for name in ("client_body", "proxy", "fastcgi", "uwsgi", "scgi"):
            self.assertTrue((runtime / "nginx" / f"{name}_temp").is_dir())
        self.shell('prepare_runtime_directory "$1" "$2" "$3"', runtime, os.getuid(), os.getgid())
        self.assertEqual(foreign.stat(), before)

    def test_namespace_rejects_symlinked_work_directories(self):
        runtime, foreign = self.root / "shieldpm", self.root / "foreign"
        runtime.mkdir()
        foreign.mkdir()
        (runtime / "nginx").symlink_to(foreign, target_is_directory=True)
        result = self.shell('prepare_runtime_directory "$1" "$2" "$3"', runtime,
                            os.getuid(), os.getgid(), check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Refusing a symlink", result.stderr)
        self.assertEqual(list(foreign.iterdir()), [])

    def test_startup_ownership_changes_do_not_include_shared_system_directories(self):
        source = (REPO / "rootfs/usr/local/bin/start.sh").read_text()
        branch = source.split('if [ "$PUID" != "0" ]; then', 1)[1].split("    export HOME=", 1)[0]
        commands = re.findall(r"(?ms)^    find .*?-exec chown[^\n]+\{\} \+", branch)
        self.assertTrue(commands, "startup ownership operation not found")
        mappings = {name: str(self.root / name.lstrip("/")) for name in ("/data", "/run", "/tmp", "/usr/local")}
        for name in mappings.values():
            directory = Path(name)
            directory.mkdir(parents=True)
            (directory / "existing-file").touch()
        executable = self.root / "bin"
        executable.mkdir()
        chown = executable / "chown"
        chown.write_text('#!/bin/sh\nshift 2\nprintf "%s\\n" "$@" >> "$OWNERSHIP_LOG"\n')
        chown.chmod(0o700)
        program = re.sub(r"/usr/local|/run|/tmp|/data", lambda match: mappings[match[0]], "\n".join(commands))
        self.shell('PATH=$1:$PATH; OWNERSHIP_LOG=$2; PUID=65534; PGID=65534; '
                   'export PATH OWNERSHIP_LOG PUID PGID; ' + program, executable, self.root / "ownership.log")
        changed = (self.root / "ownership.log").read_text().splitlines()
        self.assertTrue(changed)
        self.assertTrue(all(Path(path).is_relative_to(mappings["/data"]) for path in changed), changed)

    def test_php_fpm_pid_and_error_log_leave_distribution_system_paths(self):
        source = (REPO / "rootfs/usr/local/bin/start.sh").read_text()
        for version in (82, 83, 84):
            for prefix in ("", ";", "  ;  "):
                with self.subTest(version=version, prefix=prefix):
                    config = self.root / f"php{version}-fpm.conf"
                    config.write_text(
                        f"[global]\n{prefix}pid = /run/php/php{version}-fpm.pid\n"
                        f"{prefix}error_log = /var/log/php{version}-fpm.log\n"
                        "daemonize = yes\ninclude=/etc/php/pool.d/*.conf\n")
                    commands = [line.strip().replace(f"/data/php/{version}/php-fpm.conf", str(config))
                                for line in source.splitlines() if line.lstrip().startswith("sed ")
                                and f"/data/php/{version}/php-fpm.conf" in line]
                    for _ in range(2):
                        self.shell("\n".join(commands))
                    configured = config.read_text()
                    self.assertIn(f"\npid = /run/shieldpm/php{version}.pid\n", configured)
                    self.assertIn(f"\nerror_log = /data/php/{version}/php-fpm.log\n", configured)
                    self.assertIn("\ndaemonize = yes\n", configured)
                    self.assertNotIn("/run/php/", configured)
                    self.assertNotIn("/var/log/", configured)

    def test_php_fpm_sockets_keep_the_effective_runtime_owner(self):
        source = (REPO / "rootfs/usr/local/bin/start.sh").read_text().split('if [ "$PUID" != "0" ]; then', 1)[0]
        for version in (82, 83, 84):
            for prefix in ("", "  ", ";"):
                with self.subTest(version=version, prefix=prefix):
                    config = self.root / f"php{version}-www.conf"
                    config.write_text(
                        f"[www]\nlisten = /run/php/php{version}-fpm.sock\n"
                        f"{prefix}listen.owner = www-data\n{prefix}listen.group = www-data\n"
                        "listen.mode = 0660\n")
                    commands = [line.strip().replace(f"/data/php/{version}/pool.d/www.conf", str(config))
                                for line in source.splitlines() if line.lstrip().startswith("sed ")
                                and f"/data/php/{version}/pool.d/www.conf" in line]
                    for _ in range(2):
                        self.shell("\n".join(commands))
                    configured = config.read_text()
                    self.assertIn(f"\nlisten = /run/shieldpm/php{version}.sock\n", configured)
                    self.assertIsNone(re.search(r"(?m)^\s*listen\.(owner|group)\s*=", configured))
                    self.assertIn("\nlisten.mode = 0660\n", configured)

    def test_selected_service_uid_can_bind_all_sockets_and_write_nginx_work_files(self):
        # Some review sandboxes block socket(2) / setuid(2). GitHub CI must run
        # this integration test, while that explicit local restriction is shown.
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM):
                pass
        except OSError as error:
            if error.errno in (errno.EPERM, errno.EACCES) and not os.environ.get("CI"):
                self.skipTest(f"local runtime blocks AF_UNIX: {error}")
            raise
        prefix = ()
        uid, gid = os.getuid(), os.getgid()
        if uid == 0:
            uid = gid = 65534
        elif shutil.which("sudo") and subprocess.run(
                ["sudo", "-n", "true"], capture_output=True).returncode == 0:
            prefix = ("sudo", "-n")
            uid = gid = 65534
        self.root.chmod(0o755)
        runtime = self.root / "shieldpm"
        self.shell('prepare_runtime_directory "$1" "$2" "$3"', runtime, uid, gid, prefix=prefix)
        self.addCleanup(lambda: subprocess.run([*prefix, "rm", "-rf", str(runtime)], check=True))
        code = '''
import os, socket, sys
from pathlib import Path
root, uid, gid = Path(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
if os.geteuid() == 0:
    os.setgroups([])
    os.setgid(gid)
    os.setuid(uid)
assert os.geteuid() == uid and os.getegid() == gid
names = ['shieldpm.sock', 'goaccess.sock', 'php82.sock', 'php83.sock', 'php84.sock',
         'nginx-7.sock', 'anubis.sock', 'anubis-upstream.sock', 'oauth2-proxy-7.sock']
for name in names:
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as listener:
        listener.bind(str(root / name))
        listener.listen(1)
    (root / name).unlink()
for name in ['client_body', 'proxy', 'fastcgi', 'uwsgi', 'scgi']:
    (root / 'nginx' / (name + '_temp') / 'request').write_text('body')
(root / 'nginx/nginx.pid').write_text(str(os.getpid()))
(root / 'goa/index.html').write_text('report')
(root / 'home/.cache').mkdir()
assert (root / 'goa/index.html').stat().st_uid == uid
'''
        result = subprocess.run([*prefix, sys.executable, "-c", code, str(runtime), str(uid), str(gid)],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_nginx_runtime_rewrite_is_repeatable_and_preserves_unrelated_paths(self):
        config = self.root / "nginx.conf"
        config.write_text('''pid logs/nginx.pid;
events { worker_connections 512; }
http {
    client_body_temp_path /usr/local/nginx/client_body_temp 1 2;
    proxy_temp_path /usr/local/nginx/proxy_temp;
    server {
        location /api/ { proxy_pass http://unix:/run/shieldpm.sock:/; }
        location /goa/ { proxy_pass http://unix:/run/goaccess.sock:$request_uri; }
        root /tmp/goa;
        fastcgi_pass unix:/run/php82.sock;
        fastcgi_pass unix:/run/php83.sock;
        fastcgi_pass unix:/run/php84.sock;
        listen unix:/run/nginx-7.sock;
        proxy_pass http://unix:/run/anubis/nginx.sock;
        listen unix:/run/nginx/anubis-upstream.sock;
        proxy_pass http://unix:/run/docker.sock;
        alias /tmp/goaccess-user/;
    }
}
''')
        config.chmod(0o640)
        self.shell('configure_nginx_runtime "$1" /run/shieldpm', config)
        expected = config.read_text()
        self.shell('configure_nginx_runtime "$1" /run/shieldpm', config)
        self.assertEqual(config.read_text(), expected)
        self.assertEqual(config.stat().st_mode & 0o777, 0o640)
        self.assertIn("pid /run/shieldpm/nginx/nginx.pid;", expected)
        self.assertIn("client_body_temp_path /run/shieldpm/nginx/client_body_temp 1 2;", expected)
        for name in ("proxy", "fastcgi", "uwsgi", "scgi"):
            self.assertIn(f"{name}_temp_path /run/shieldpm/nginx/{name}_temp;", expected)
        self.assertIn("http://unix:/run/shieldpm/shieldpm.sock:/;", expected)
        self.assertIn("http://unix:/run/shieldpm/goaccess.sock:$request_uri;", expected)
        self.assertIn("root /run/shieldpm/goa;", expected)
        self.assertIn("unix:/run/docker.sock;", expected)
        self.assertIn("alias /tmp/goaccess-user/;", expected)
        for name in ("php82", "php83", "php84", "nginx-7", "anubis", "anubis-upstream"):
            self.assertIn(f"unix:/run/shieldpm/{name}.sock;", expected)

    def test_default_configuration_migrates_with_backup_and_fixed_include(self):
        legacy, target = self.root / "default.conf", self.root / "data/default.conf"
        backups = self.root / "backups"
        original = "server { listen 80 default_server; return 444; }\n"
        legacy.write_text(original)
        self.shell('migrate_default_nginx_config "$1" "$2" "$3"', legacy, target, backups)
        self.assertEqual(target.read_text(), original)
        self.assertEqual(legacy.read_text(), f"include {target};\n")
        self.assertEqual(legacy.stat().st_uid, os.geteuid())
        self.assertEqual(legacy.stat().st_mode & 0o777, 0o644)
        copies = list(backups.glob("*/default.conf"))
        self.assertEqual(len(copies), 1)
        self.assertEqual(copies[0].read_text(), original)
        target.write_text("server { return 404; }\n")
        self.shell('migrate_default_nginx_config "$1" "$2" "$3"', legacy, target, backups)
        self.assertEqual(target.read_text(), "server { return 404; }\n")
        self.assertEqual(list(backups.glob("*/default.conf")), copies)

    def test_default_configuration_keeps_original_when_target_cannot_be_published(self):
        legacy, target = self.root / "default.conf", self.root / "data/default.conf"
        original = "server { return 444; }\n"
        legacy.write_text(original)
        target.parent.mkdir()
        target.symlink_to(self.root / "missing-target")
        result = self.shell('migrate_default_nginx_config "$1" "$2" "$3"', legacy, target,
                            self.root / "backups", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(legacy.read_text(), original)
        self.assertTrue(target.is_symlink())
        self.assertEqual(list(target.parent.glob(".default-runtime-*")), [])

    def test_first_boot_creates_default_include_target_before_nginx_starts(self):
        legacy, target = self.root / "default.conf", self.root / "data/default.conf"
        self.shell('migrate_default_nginx_config "$1" "$2" "$3"', legacy, target, self.root / "backups")
        self.assertEqual(legacy.read_text(), f"include {target};\n")
        self.assertEqual(target.read_text(), "")

    def test_regeneration_keeps_default_and_ip_range_includes(self):
        source = (REPO / "rootfs/usr/local/bin/start.sh").read_text()
        branch = source.split('if [ "$REGENERATE_ALL" = "true" ]; then', 1)[1].split("\nfi", 1)[0]
        for filename in ("default.conf", "ip_ranges.conf", "proxy_host/1.conf", "redirection_host/2.conf",
                         "dead_host/3.conf", "stream/4.conf"):
            path = self.root / filename
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("server configuration")
        self.shell(branch.replace("/data/nginx", str(self.root)))
        self.assertEqual(sorted(str(path.relative_to(self.root)) for path in self.root.rglob("*.conf")),
                         ["default.conf", "ip_ranges.conf"])


if __name__ == "__main__":
    unittest.main()
