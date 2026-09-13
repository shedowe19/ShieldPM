#!/usr/bin/env sh

# These files survive native service and Docker container restarts. Always
# replace the current value, rather than matching only the shipped default.
prepare_runtime_directory() {
    runtime_root=$1
    runtime_uid=$2
    runtime_gid=$3
    for runtime_directory in "$runtime_root" "$runtime_root/nginx" "$runtime_root/goa" "$runtime_root/home" \
        "$runtime_root/nginx/client_body_temp" "$runtime_root/nginx/proxy_temp" \
        "$runtime_root/nginx/fastcgi_temp" "$runtime_root/nginx/uwsgi_temp" "$runtime_root/nginx/scgi_temp"; do
        if [ -L "$runtime_directory" ]; then
            echo "Refusing a symlink runtime directory: $runtime_directory" >&2
            return 1
        fi
        mkdir -p "$runtime_directory" || return 1
    done
    # Only this application's namespace belongs to the selected runtime UID.
    find "$runtime_root" -xdev -not \( -uid "$runtime_uid" -and -gid "$runtime_gid" \) \
        -exec chown -h "$runtime_uid:$runtime_gid" {} + || return 1
    chmod 700 "$runtime_root" "$runtime_root/home" || return 1
}

configure_nginx_runtime() {
    python3 - "$1" "$2" <<'PY'
import os
from pathlib import Path
import re
import sys
import tempfile

path, runtime = map(Path, sys.argv[1:])
content = path.read_text()
replacements = {
    "/run/shieldpm.sock": str(runtime / "shieldpm.sock"),
    "/run/goaccess.sock": str(runtime / "goaccess.sock"),
    "/run/anubis/nginx.sock": str(runtime / "anubis.sock"),
    "/run/nginx/anubis-upstream.sock": str(runtime / "anubis-upstream.sock"),
    "/tmp/goa": str(runtime / "goa"),
    **{f"/run/php{version}.sock": str(runtime / f"php{version}.sock") for version in (82, 83, 84)},
}
for old, new in replacements.items():
    content = re.sub(re.escape(old) + r"(?=[:/;\s'\"]|$)", lambda _: new, content)
content = re.sub(r"/run/nginx-(\d+)\.sock(?=[:;\s'\"]|$)",
                 lambda match: str(runtime / f"nginx-{match[1]}.sock"), content)
if re.search(r"^\s*http\s*\{", content, re.MULTILINE):
    pid = f"pid {runtime}/nginx/nginx.pid;"
    if re.search(r"^\s*pid\s+[^;]+;", content, re.MULTILINE):
        content = re.sub(r"^\s*pid\s+[^;]+;", lambda _: pid, content, flags=re.MULTILINE)
    else:
        content = pid + "\n" + content
    missing = []
    for name in ("client_body", "proxy", "fastcgi", "uwsgi", "scgi"):
        directive = f"{name}_temp_path"
        pattern = rf"(^[ \t]*{directive}\s+)[^;\s]+"
        if re.search(pattern, content, re.MULTILINE):
            content = re.sub(pattern, lambda match: match[1] + str(runtime / "nginx" / f"{name}_temp"),
                             content, flags=re.MULTILINE)
        else:
            missing.append(f"    {directive} {runtime}/nginx/{name}_temp;")
    if missing:
        content = re.sub(r"(^[ \t]*http\s*\{)", lambda match: match[1] + "\n" + "\n".join(missing),
                         content, count=1, flags=re.MULTILINE)
descriptor, temporary = tempfile.mkstemp(prefix=".shieldpm-runtime-", dir=path.parent)
try:
    with os.fdopen(descriptor, "w") as handle:
        handle.write(content)
        os.fchmod(handle.fileno(), path.stat().st_mode & 0o777)
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY
}

migrate_default_nginx_config() {
    python3 - "$1" "$2" "$3" <<'PY'
import os
from pathlib import Path
import shutil
import sys
import tempfile

legacy, target, backup_root = map(Path, sys.argv[1:])
include = f"include {target};\n"
target.parent.mkdir(parents=True, exist_ok=True)
if target.exists() and not target.is_file():
    raise RuntimeError(f"Default Nginx configuration is not a regular file: {target}")
content = legacy.read_text() if legacy.exists() else ""
if content and content.strip() != include.strip():
    backup_root.mkdir(parents=True, exist_ok=True)
    backup = Path(tempfile.mkdtemp(prefix="nginx-default.", dir=backup_root)) / "default.conf"
    shutil.copy2(legacy, backup)
    print(f"Original default Nginx configuration retained in {backup}")
if not target.exists():
    descriptor, temporary = tempfile.mkstemp(prefix=".default-runtime-", dir=target.parent)
    try:
        with os.fdopen(descriptor, "w") as handle:
            handle.write(content if content.strip() != include.strip() else "")
        os.link(temporary, target)
    finally:
        os.unlink(temporary)
descriptor, temporary = tempfile.mkstemp(prefix=".default-include-", dir=legacy.parent)
try:
    with os.fdopen(descriptor, "w") as handle:
        handle.write(include)
        os.fchmod(handle.fileno(), 0o644)
    os.replace(temporary, legacy)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY
}

configure_certbot_ini() {
    certbot_ini=$1
    certbot_no_verify=false
    [ "$ACME_SERVER_TLS_VERIFY" = false ] && certbot_no_verify=true
    certbot_profile="#required-profile"
    [ "$ACME_PROFILE" = none ] || certbot_profile="required-profile = $ACME_PROFILE"
    sed -i -E \
        -e "s|^key-type[[:space:]]*=.*|key-type = $ACME_KEY_TYPE|" \
        -e "s|^must-staple[[:space:]]*=.*|must-staple = $ACME_MUST_STAPLE|" \
        -e "s|^no-verify-ssl[[:space:]]*=.*|no-verify-ssl = $certbot_no_verify|" \
        -e "s|^#?required-profile([[:space:]]*=.*)?$|$certbot_profile|" "$certbot_ini"
}

configure_ui_listeners() {
    listener_file=$1
    listener_ipv4=$2
    listener_ipv6=$3
    listener_port=$4
    listener_ipv6_prefix=""
    [ "$DISABLE_IPV6" = true ] && listener_ipv6_prefix="#"
    sed -i -E \
        -e "s|^([[:space:]]*)#?[[:space:]]*listen[[:space:]]+[0-9.]+:[0-9]+([[:space:];])|\1listen $listener_ipv4:$listener_port\2|" \
        -e "s|^([[:space:]]*)#?[[:space:]]*listen[[:space:]]+\[[^]]+\]:[0-9]+([[:space:];])|\1${listener_ipv6_prefix}listen $listener_ipv6:$listener_port\2|" "$listener_file"
}

configure_nginx_toggles() {
    nginx_config=$1
    nginx_log_setting=off
    [ "$NGINX_LOG_NOT_FOUND" = true ] && nginx_log_setting=on
    nginx_error_page_prefix="#"
    [ "$NGINX_404_REDIRECT" = true ] && nginx_error_page_prefix=""
    nginx_proxy_buffering=on
    [ "$NGINX_DISABLE_PROXY_BUFFERING" = true ] && nginx_proxy_buffering=off
    sed -i -E \
        -e "s|^([[:space:]]*)log_not_found[[:space:]]+[^;]*;|\1log_not_found $nginx_log_setting;|" \
        -e "s|^([[:space:]]*)#?[[:space:]]*error_page[[:space:]]+404([[:space:]])|\1${nginx_error_page_prefix}error_page 404\2|" \
        -e "s|^([[:space:]]*)proxy_buffering[[:space:]]+[^;]*;|\1proxy_buffering $nginx_proxy_buffering;|" \
        -e "s|^([[:space:]]*)proxy_request_buffering[[:space:]]+[^;]*;|\1proxy_request_buffering $nginx_proxy_buffering;|" \
        -e "s|^([[:space:]]*)worker_processes[[:space:]]+[^;]*;|\1worker_processes $NGINX_WORKER_PROCESSES;|" \
        -e "s|^([[:space:]]*)worker_connections[[:space:]]+[^;]*;|\1worker_connections $NGINX_WORKER_CONNECTIONS;|" "$nginx_config"
}

configure_nginx_modules() {
    python3 - "$1" <<'PY'
import os
from pathlib import Path
import re
import sys
import tempfile

path = Path(sys.argv[1])
enabled = lambda key: os.environ.get(key, "false") == "true"
modules = {
    "libngx_module.so": "NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE",
    "ngx_http_geoip2_module.so": "NGINX_LOAD_GEOIP2_MODULE",
    "ngx_stream_geoip2_module.so": "NGINX_LOAD_GEOIP2_MODULE",
    "ngx_http_js_module.so": "NGINX_LOAD_NJS_MODULE",
    "ngx_stream_js_module.so": "NGINX_LOAD_NJS_MODULE",
    "ngx_http_upstream_ntlm_module.so": "NGINX_LOAD_NTLM_MODULE",
    "ngx_http_vhost_traffic_status_module.so": "NGINX_LOAD_VHOST_TRAFFIC_STATUS_MODULE",
}
geoip = False
hsts = False
lines = []
for line in path.read_text().splitlines(keepends=True):
    module = re.match(r"^(\s*)#?\s*(load_module\s+(\S+);.*)", line)
    if module and Path(module[3].rstrip(";")).name in modules:
        name = Path(module[3].rstrip(";")).name
        line = module[1] + ("" if enabled(modules[name]) else "#") + module[2] + "\n"
    if re.match(r"^\s*#?\s*geoip2 /data/nginx/GeoLite2-(Country|City)\.mmdb\s*\{", line):
        geoip = True
    if geoip:
        directive = re.match(r"^(\s*)#?\s*(geoip2\s+.*|auto_reload\s+.*|\$geoip2_\w+\s+.*|\}.*)", line)
        if directive:
            line = directive[1] + ("" if enabled("NGINX_LOAD_GEOIP2_MODULE") else "#") + directive[2] + "\n"
            if directive[2].startswith("}"):
                geoip = False
    # Keep the comma inside Nginx's quoted JSON fragment. Older startup scripts
    # could remove its quotes; normalize both the shipped and that legacy form.
    if '"geoip_country_code": "$geoip2_country_code"' in line:
        indent = re.match(r"^\s*", line)[0]
        line = indent + ("" if enabled("NGINX_LOAD_GEOIP2_MODULE") else "#") + "',\"geoip_country_code\": \"$geoip2_country_code\"'\n"
    if re.match(r"^\s*map \$scheme \$hsts_includeSubDomains_header\s*\{", line):
        hsts = True
    elif hsts and re.match(r"^\s*}", line):
        hsts = False
    elif hsts and 'max-age=' in line:
        line = re.sub(r"includeSubDomains;\s*", "", line)
        if os.environ.get("NGINX_HSTS_SUBDOMAINS", "true") == "true":
            line = re.sub(r"(max-age=\d+;)\s*", r"\1 includeSubDomains; ", line)
    compression = "off" if enabled("NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE") else "on"
    line = re.sub(r"^(\s*(?:brotli|unbrotli|brotli_static|zstd|zstd_static)\s+)(?:on|off);", rf"\g<1>{compression};", line)
    real_ip = "proxy_protocol" if enabled("LISTEN_PROXY_PROTOCOL") else "X-Forwarded-For"
    line = re.sub(r"^(\s*real_ip_header\s+)[^;]+;", rf"\g<1>{real_ip};", line)
    for label, filename, log_format in (("http", "access", "alog"), ("stream", "stream", "slog")):
        match = re.match(rf"^(\s*)access_log (?:off;\s*# {label}|/data/nginx/{filename}\.log {log_format};)\s*$", line)
        if match:
            setting = f"/data/nginx/{filename}.log {log_format};" if enabled("LOGROTATE") else f"off; # {label}"
            line = match[1] + "access_log " + setting + "\n"
    error_log = re.match(r"^(\s*)#?\s*(error_log /data/nginx/error\.log\s+.*)", line)
    if error_log:
        line = error_log[1] + ("" if enabled("LOGROTATE") else "#") + error_log[2] + "\n"
    lines.append(line)
descriptor, temporary = tempfile.mkstemp(prefix=".shieldpm-nginx-", dir=path.parent)
try:
    with os.fdopen(descriptor, "w") as handle:
        handle.write("".join(lines))
        os.fchmod(handle.fileno(), path.stat().st_mode & 0o777)
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY
}

select_default_certificate() {
    default_tls_root=$1
    default_certificate_id=$2
    DEFAULT_CERT="$default_tls_root/dummycert.pem"
    DEFAULT_KEY="$default_tls_root/dummykey.pem"
    unset DEFAULT_STAPLING_FILE
    if [ "$default_certificate_id" != 0 ]; then
        for default_certificate_type in certbot/live custom internal; do
            default_certificate_dir="$default_tls_root/$default_certificate_type/npm-$default_certificate_id"
            if [ -s "$default_certificate_dir/fullchain.pem" ] && [ -s "$default_certificate_dir/privkey.pem" ]; then
                DEFAULT_CERT="$default_certificate_dir/fullchain.pem"
                DEFAULT_KEY="$default_certificate_dir/privkey.pem"
                if { [ "$default_certificate_type" = certbot/live ] && [ "$ACME_OCSP_STAPLING" = true ]; } || \
                   { [ "$default_certificate_type" = custom ] && [ "$CUSTOM_OCSP_STAPLING" = true ]; }; then
                    if [ -s "$default_certificate_dir.der" ]; then
                        export DEFAULT_STAPLING_FILE="$default_certificate_dir.der"
                    fi
                fi
                break
            fi
        done
    fi
    export DEFAULT_CERT DEFAULT_KEY
}

configure_certificate_stapling() {
    stapling_config=$1
    if [ -n "${DEFAULT_STAPLING_FILE:-}" ] && [ -s "$DEFAULT_STAPLING_FILE" ]; then
        sed -i -E \
            -e 's|^([[:space:]]*)#?[[:space:]]*(ssl_stapling)|\1\2|' \
            -e "s|ssl_stapling_file[[:space:]]+[^;]*;|ssl_stapling_file $DEFAULT_STAPLING_FILE;|" "$stapling_config"
    else
        sed -i -E 's|^([[:space:]]*)#?[[:space:]]*(ssl_stapling)|\1#\2|' "$stapling_config"
    fi
}
