"""Check repeated startup configuration without changing host services or files."""

import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[2]
HELPERS = REPO / "rootfs/usr/local/bin/runtime-config.sh"


class RuntimeConfigTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

    def shell(self, program, *args, **environment):
        result = subprocess.run(
            ["sh", "-eu", "-c", '. "$1"; shift; ' + program, "test", str(HELPERS), *map(str, args)],
            env={**os.environ, **environment}, text=True, capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def test_certbot_options_can_be_changed_back_after_restart(self):
        config = self.root / "certbot.ini"
        config.write_text((REPO / "rootfs/etc/certbot.ini").read_text())
        for key_type, staple, verify, profile in [
            ("rsa", "false", "false", "shortlived"),
            ("ecdsa", "true", "true", "none"),
            ("rsa", "false", "true", "tlsserver"),
        ]:
            with self.subTest(profile=profile):
                self.shell('configure_certbot_ini "$1"', config, ACME_KEY_TYPE=key_type,
                           ACME_MUST_STAPLE=staple, ACME_SERVER_TLS_VERIFY=verify, ACME_PROFILE=profile)
                lines = config.read_text().splitlines()
                self.assertIn(f"key-type = {key_type}", lines)
                self.assertIn(f"must-staple = {staple}", lines)
                self.assertIn(f"no-verify-ssl = {'true' if verify == 'false' else 'false'}", lines)
                expected_profile = "#required-profile" if profile == "none" else f"required-profile = {profile}"
                self.assertEqual([line for line in lines if "required-profile" in line], [expected_profile])

    def test_listener_updates_preserve_parameters_and_reenable_ipv6(self):
        config = self.root / "listeners.conf"
        config.write_text("  listen 0.0.0.0:81 ssl proxy_protocol;\n  listen [::]:81 ssl;\n  listen unix:/run/internal.sock;\n")
        self.shell('configure_ui_listeners "$1" "$2" "$3" "$4"', config,
                   "127.0.0.1", "[::1]", "8443", DISABLE_IPV6="true")
        self.assertIn("listen 127.0.0.1:8443 ssl proxy_protocol;", config.read_text())
        self.assertIn("#listen [::1]:8443 ssl;", config.read_text())
        self.shell('configure_ui_listeners "$1" "$2" "$3" "$4"', config,
                   "192.0.2.2", "[2001:db8::2]", "9443", DISABLE_IPV6="false")
        self.assertEqual(config.read_text(), "  listen 192.0.2.2:9443 ssl proxy_protocol;\n  listen [2001:db8::2]:9443 ssl;\n  listen unix:/run/internal.sock;\n")

    def certificate(self, provider, identifier=7):
        directory = self.root / provider / f"npm-{identifier}"
        directory.mkdir(parents=True)
        (directory / "fullchain.pem").write_text("certificate")
        (directory / "privkey.pem").write_text("key")
        return directory

    def test_nginx_toggles_and_workers_return_to_defaults(self):
        config = self.root / "nginx.conf"
        baseline = ("log_not_found off;\n#error_page 404 = @redirect;\nproxy_buffering on;\n"
                    "proxy_request_buffering on;\nworker_processes auto;\nworker_connections 512;\n")
        config.write_text(baseline)
        self.shell('configure_nginx_toggles "$1"', config, NGINX_LOG_NOT_FOUND="true",
                   NGINX_404_REDIRECT="true", NGINX_DISABLE_PROXY_BUFFERING="true",
                   NGINX_WORKER_PROCESSES="4", NGINX_WORKER_CONNECTIONS="2048")
        self.assertIn("log_not_found on;", config.read_text())
        self.assertIn("\nerror_page 404 = @redirect;", config.read_text())
        self.assertIn("proxy_request_buffering off;", config.read_text())
        self.assertIn("worker_processes 4;", config.read_text())
        self.shell('configure_nginx_toggles "$1"', config, NGINX_LOG_NOT_FOUND="false",
                   NGINX_404_REDIRECT="false", NGINX_DISABLE_PROXY_BUFFERING="false",
                   NGINX_WORKER_PROCESSES="auto", NGINX_WORKER_CONNECTIONS="512")
        self.assertEqual(config.read_text(), baseline)

    def selection(self, identifier, **environment):
        return self.shell('select_default_certificate "$1" "$2"; printf "%s\\n%s\\n%s" "$DEFAULT_CERT" "$DEFAULT_KEY" "${DEFAULT_STAPLING_FILE:-}"',
                          self.root, identifier, ACME_OCSP_STAPLING="true", CUSTOM_OCSP_STAPLING="true", **environment).split("\n")

    def test_internal_default_certificate_is_selected_without_stale_stapling(self):
        directory = self.certificate("internal")
        self.assertEqual(self.selection(7, DEFAULT_STAPLING_FILE="stale.der"),
                         [str(directory / "fullchain.pem"), str(directory / "privkey.pem"), ""])

    def test_incomplete_certificate_pair_falls_back_together(self):
        directory = self.certificate("custom")
        (directory / "privkey.pem").unlink()
        self.assertEqual(self.selection(7), [str(self.root / "dummycert.pem"), str(self.root / "dummykey.pem"), ""])

    def test_stapling_is_removed_when_disabled_or_certificate_changes(self):
        directory = self.certificate("certbot/live")
        staple = directory.with_suffix(".der")
        staple.write_text("OCSP response")
        self.assertEqual(self.selection(7)[2], str(staple))
        output = self.shell('select_default_certificate "$1" 7; ACME_OCSP_STAPLING=false; select_default_certificate "$1" 7; printf "%s" "${DEFAULT_STAPLING_FILE:-}"',
                            self.root, ACME_OCSP_STAPLING="true", CUSTOM_OCSP_STAPLING="true")
        self.assertEqual(output, "")
        self.assertEqual(self.selection(0, DEFAULT_STAPLING_FILE=str(staple))[2], "")

    def test_stapling_directives_toggle_without_duplicate_comments(self):
        config, staple = self.root / "nginx.conf", self.root / "response.der"
        config.write_text("  #ssl_stapling on;\n  #ssl_stapling_verify on;\n  #ssl_stapling_file /old.der;\n  ssl_certificate /cert.pem;\n")
        staple.write_text("OCSP response")
        self.shell('configure_certificate_stapling "$1"', config, DEFAULT_STAPLING_FILE=str(staple))
        self.assertIn(f"  ssl_stapling_file {staple};", config.read_text())
        for _ in range(2):
            self.shell('configure_certificate_stapling "$1"', config, DEFAULT_STAPLING_FILE="")
        self.assertEqual(config.read_text().count("#ssl_stapling"), 3)
        self.assertNotIn("##", config.read_text())
        self.assertIn("  ssl_certificate /cert.pem;", config.read_text())

    def test_disabled_goaccess_removes_listener_and_preserves_data(self):
        # Run the actual startup branch with only its paths redirected into a fixture.
        source = (REPO / "rootfs/usr/local/bin/start.sh").read_text()
        branch = source.split('if [ "$GOA" = "true" ]; then', 1)[1].split('\nif [ "$NGINX_QUIC_BPF"', 1)[0]
        program = 'if [ "$GOA" = "true" ]; then' + branch
        nginx, data = self.root / "nginx", self.root / "data"
        (nginx / "include").mkdir(parents=True)
        (nginx / "include/goaccess.conf").write_text("listen updated;")
        (nginx / "goaccess.conf").write_text("listen stale;")
        (data / "goaccess").mkdir(parents=True)
        (data / "goaccess/report").write_text("history")
        program = program.replace("/usr/local/nginx/conf/conf.d", str(nginx)).replace("/data", str(data))
        self.shell(program, GOA="true", FULLCLEAN="false")
        self.assertEqual((nginx / "goaccess.conf").read_text(), "listen updated;")
        self.shell(program, GOA="false", FULLCLEAN="false")
        self.assertFalse((nginx / "goaccess.conf").exists())
        self.assertEqual((data / "goaccess/report").read_text(), "history")

    def test_healthcheck_uses_effective_localhost_bindings(self):
        executable = self.root / "bin"
        executable.mkdir()
        for name, program in {
            "nc": '#!/bin/sh\n[ "$4" = 127.0.0.1 ] && [ "$5" = 9091 ]\n',
            "curl": '#!/bin/sh\nfor last do :; done\n[ "$last" = https://127.0.0.1:9081/api/ ] || exit 22\nprintf \'{"status":"OK"}\'\n',
        }.items():
            path = executable / name
            path.write_text(program)
            path.chmod(0o700)
        (self.root / "index.html").write_text("GoAccess")
        env_file = self.root / ".env"
        env_file.write_text("GOA=true\nGOA_PORT=9091\nNPM_PORT=9081\n"
                            "NPM_IPV4_BINDING=192.0.2.1\nGOA_IPV4_BINDING=192.0.2.2\n"
                            "NPM_LISTEN_LOCALHOST=true\nGOA_LISTEN_LOCALHOST=true\n")
        script = (REPO / "rootfs/usr/local/bin/healthcheck.sh").read_text()
        script = script.replace("/data/.env", str(env_file)).replace("/tmp/goa/index.html", str(self.root / "index.html"))
        result = subprocess.run(["sh", "-c", script], capture_output=True, text=True,
                                env={**os.environ, "PATH": f"{executable}:{os.environ['PATH']}"})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "OK\n")

    def test_optional_modules_are_reversible_and_do_not_uncomment_foreign_blocks(self):
        # Representative directives from shieldpm-nginx master e8cadd2f.
        config = self.root / "nginx.conf"
        original = '''#load_module modules/libngx_module.so;
#load_module modules/ngx_http_geoip2_module.so;
#load_module modules/ngx_stream_geoip2_module.so;
#load_module modules/ngx_http_js_module.so;
#load_module modules/ngx_stream_js_module.so;
#load_module modules/ngx_http_upstream_ntlm_module.so;
#load_module modules/ngx_http_vhost_traffic_status_module.so;
#load_module modules/otel_ngx_module.so;
error_log stderr warn;
#error_log /data/nginx/error.log warn;
access_log /data/nginx/json_access.log json_analytics;
access_log off; # http
access_log off; # stream
    #geoip2 /data/nginx/GeoLite2-Country.mmdb {
    #    auto_reload 5m;
    #    # Keep this documentation comment intact.
    #    $geoip2_country_code default=XX source=$remote_addr country iso_code;
    #}
    #geoip2 /data/nginx/GeoLite2-City.mmdb {
    #    auto_reload 5m;
    #    $geoip2_city_name default=Unknown source=$remote_addr city names en;
    #}
    #map $host $unrelated {
    #    default none;
    #}
    #,'"geoip_country_code": "$geoip2_country_code"'
    map $scheme $hsts_header {
        https "max-age=63072000; preload";
    }
    map $scheme $hsts_includeSubDomains_header {
        https "max-age=63072000; includeSubDomains; preload";
    }
    brotli on;
    unbrotli on;
    brotli_static on;
    zstd on;
    zstd_static on;
    real_ip_header X-Forwarded-For;
'''
        config.write_text(original)
        keys = ["NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE", "NGINX_LOAD_GEOIP2_MODULE",
                "NGINX_LOAD_NJS_MODULE", "NGINX_LOAD_NTLM_MODULE", "NGINX_LOAD_VHOST_TRAFFIC_STATUS_MODULE",
                "LISTEN_PROXY_PROTOCOL", "LOGROTATE"]
        previous = {}
        for enabled in ("true", "true", "false", "false", "true"):
            self.shell('configure_nginx_modules "$1"', config,
                       **{key: enabled for key in keys}, NGINX_HSTS_SUBDOMAINS=enabled)
            content = config.read_text()
            if enabled in previous:
                self.assertEqual(content, previous[enabled])
            previous[enabled] = content
            self.assertIn("    #map $host $unrelated {\n    #    default none;\n    #}\n", content)
            self.assertIn("#load_module modules/otel_ngx_module.so;", content)
            self.assertIn("#    # Keep this documentation comment intact.", content)
            self.assertIn("access_log /data/nginx/json_access.log json_analytics;", content)
            self.assertIn("error_log stderr warn;", content)
            if enabled == "true":
                self.assertIn("\nload_module modules/ngx_stream_geoip2_module.so;", content)
                self.assertIn("    geoip2 /data/nginx/GeoLite2-Country.mmdb {", content)
                self.assertIn("    brotli off;", content)
                self.assertIn("    real_ip_header proxy_protocol;", content)
                self.assertEqual(content.count("includeSubDomains;"), 1)
                self.assertIn("access_log /data/nginx/stream.log slog;", content)
                self.assertIn("\nerror_log /data/nginx/error.log warn;", content)
                fragment = next(line.strip() for line in content.splitlines() if '"geoip_country_code":' in line)
                self.assertEqual(shlex.split(fragment), [',"geoip_country_code": "$geoip2_country_code"'])
            else:
                self.assertIn("\n#load_module modules/ngx_stream_geoip2_module.so;", content)
                self.assertIn("    #geoip2 /data/nginx/GeoLite2-Country.mmdb {", content)
                self.assertIn("    brotli on;", content)
                self.assertIn("    real_ip_header X-Forwarded-For;", content)
                self.assertNotIn("includeSubDomains;", content)
                self.assertIn("access_log off; # stream", content)
                self.assertIn("#error_log /data/nginx/error.log warn;", content)


if __name__ == "__main__":
    unittest.main()
