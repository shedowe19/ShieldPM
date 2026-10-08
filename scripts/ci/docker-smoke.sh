#!/usr/bin/env bash
# Exercise the already-loaded image without contacting registries or providers.
set -Eeuo pipefail

image=${1:?Usage: docker-smoke.sh IMAGE}
health_timeout=${SMOKE_HEALTH_TIMEOUT_SECONDS:-180}
if [[ ! "$health_timeout" =~ ^[1-9][0-9]{0,2}$ ]] || (( health_timeout > 300 )); then
    echo "SMOKE_HEALTH_TIMEOUT_SECONDS must be an integer from 1 to 300" >&2
    exit 2
fi

docker_cmd() { timeout 30s docker "$@"; }

image_arch=$(docker_cmd image inspect --format '{{.Architecture}}' "$image")
case "$(uname -m):$image_arch" in
    x86_64:amd64|aarch64:arm64) ;;
    *) echo "Smoke requires an image matching this runner's native architecture" >&2; exit 1 ;;
esac

fixture=$(mktemp -d)
containers=()
volumes=()
cleanup() {
    local result=$?
    trap - EXIT
    set +e
    if (( result != 0 )); then
        for container in "${containers[@]}"; do
            echo "Smoke failure diagnostics: $container" >&2
            docker_cmd inspect --format '{{json .State}}' "$container" >&2
            docker_cmd logs --tail 200 "$container" >&2
        done
    fi
    for container in "${containers[@]}"; do
        docker_cmd rm --force "$container" >/dev/null || result=1
    done
    for volume in "${volumes[@]}"; do
        docker_cmd volume rm "$volume" >/dev/null || result=1
    done
    rm -rf -- "$fixture"
    exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# launch.sh skips ACME registration when an account directory contains a file.
# This inert marker is only an offline startup fixture, never a usable account.
mkdir -p "$fixture/tls/certbot/accounts/acme-v02.api.letsencrypt.org/directory/ci-offline"
printf '%s\n' 'offline CI marker; no account credentials' > "$fixture/tls/certbot/accounts/acme-v02.api.letsencrypt.org/directory/ci-offline/marker"
printf '%s\n' '# CI supplies its settings through the container environment.' > "$fixture/.env"
mkdir -p "$fixture/logs"
printf '%s\n' 'CI retained firewall log marker' > "$fixture/logs/ip_firewall_ci.log"

# Render the image's actual forwarding templates and exercise their gRPC directives
# against a local HTTP/2 echo service. The separate Nginx process cannot affect app listeners.
cat > "$fixture/grpc-smoke.mjs" <<'GRPC_SMOKE'
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import http from "node:http";
import dgram from "node:dgram";
import { once } from "node:events";
import fs from "node:fs/promises";
import http2 from "node:http2";
import net from "node:net";
import { SmokePortReservations, remapSmokeListeners, withSmokeEndpointRetries,
    startSmokeNginx, stopSmokeNginx } from "./nginx-smoke-endpoints.mjs";
import utils from "/app/lib/utils.js";
import apiValidator from "/app/lib/validator/api.js";
import { getCompiledSchema, getValidationSchema } from "/app/schema/index.js";
import internalNginx from "/app/internal/nginx.js";

const directory = process.env.NGINX_GRPC_SMOKE_DIRECTORY || "/data/nginx/grpc-smoke";
const socket = `${directory}/grpc-smoke.sock`;
const nginxBin = process.env.NGINX_BIN || "nginx";
const tcpInternal = process.env.NGINX_SMOKE_TCP_INTERNAL === "true";
const ipv6Host = process.env.NGINX_GRPC_SMOKE_IPV6_HOST || "::ffff:127.0.0.1";
const sessions = new Set();
const frame = (body) => {
    const header = Buffer.alloc(5);
    header.writeUInt32BE(body.length, 1);
    return Buffer.concat([header, body]);
};
const upstream = http2.createServer();
const addEcho = (server) => {
server.on("session", (session) => {
    sessions.add(session);
    session.on("close", () => sessions.delete(session));
});
server.on("stream", (stream, headers) => {
    const chunks = [];
    stream.on("error", () => {});
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => {
        stream.respond({ ":status": 200, "content-type": "application/grpc", "grpc-status": "0" });
        stream.end(frame(Buffer.from(JSON.stringify({
            method: headers[":method"], path: headers[":path"], body: Buffer.concat(chunks).toString("hex"),
        }))));
    });
});
};
addEcho(upstream);
let secureUpstream;
const httpUpstream = http.createServer((request, response) => response.end("generated-default-proxy"));
const tcpUpstream = net.createServer((connection) => connection.on("data", (data) => connection.write(data)));
const udpUpstream = dgram.createSocket(ipv6Host === "::1" ? "udp6" : "udp4");
udpUpstream.on("message", (data, remote) => udpUpstream.send(data, remote.port, remote.address));

const reservations = new SmokePortReservations();
let running;
let client;
try {
    await fs.mkdir(directory, { recursive: true });
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
        "-subj", "/CN=grpc-smoke.test", "-keyout", `${directory}/key.pem`, "-out", `${directory}/cert.pem`],
        { stdio: "ignore" });
    secureUpstream = http2.createSecureServer({
        key: await fs.readFile(`${directory}/key.pem`), cert: await fs.readFile(`${directory}/cert.pem`),
    });
    addEcho(secureUpstream);
    const binding = ipv6Host === "::1" ? "::" : "127.0.0.1";
    upstream.listen(0, binding);
    await once(upstream, "listening");
    secureUpstream.listen(0, binding);
    await once(secureUpstream, "listening");
    tcpUpstream.listen(0, binding);
    await once(tcpUpstream, "listening");
    udpUpstream.bind(0, binding);
    await once(udpUpstream, "listening");
    httpUpstream.listen(0, "127.0.0.1");
    await once(httpUpstream, "listening");
    await getCompiledSchema();
    const engine = utils.getRenderEngine();
    const base = {
        id: 70001, use_default_location: true, forward_scheme: "grpc",
        forward_host: "127.0.0.1", forward_port: upstream.address().port, access_list_id: 0,
    };
    const cases = ["grpc", "grpcs"].flatMap((scheme) =>
        ["127.0.0.1", ipv6Host, `[${ipv6Host}]`].flatMap((address, index) => [
            { route: `/${scheme}-${index}-default/`, template: "_proxy_logic.conf", scheme, address },
            { route: `/${scheme}-${index}-custom/`, template: "_proxy_host_custom_location.conf", scheme, address },
        ]));
    const locations = [];
    for (const item of cases) {
        const targetPort = (item.scheme === "grpcs" ? secureUpstream : upstream).address().port;
        const payload = { domain_names: ["grpc-smoke.test"], forward_scheme: item.scheme,
            forward_host: item.address, forward_port: targetPort,
            locations: [{ path: item.route, forward_scheme: item.scheme, forward_host: item.address, forward_port: targetPort }] };
        await apiValidator(getValidationSchema("/nginx/proxy-hosts", "post"), payload);
        const rendered = await engine.renderFile(item.template, { ...base, path: item.route,
            forward_scheme: item.scheme, forward_host: item.address, forward_port: targetPort });
        const directives = rendered.match(/^\s*grpc_pass [^;]+;/gm) || [];
        assert.equal(directives.filter((line) => line.trim().startsWith("grpc_pass ")).length, 1);
        locations.push(`location ${item.route} { ${directives.join("\n")} }`);
    }
    const streamCases = ["tcp", "udp"].flatMap((protocol) =>
        ["127.0.0.1", ipv6Host, `[${ipv6Host}]`].map((address) => ({ protocol, address })));
    const streams = [];
    for (const item of streamCases) {
        item.port = await reservations.reserve(item.protocol);
        const payload = { incoming_port: String(item.port), forwarding_host: item.address,
            forwarding_port: String((item.protocol === "tcp" ? tcpUpstream : udpUpstream).address().port),
            tcp_forwarding: item.protocol === "tcp", udp_forwarding: item.protocol === "udp" };
        await apiValidator(getValidationSchema("/nginx/streams", "post"), payload);
        let rendered = (await engine.renderFile("stream.conf", { ...payload, enabled: true,
            env: { IPV4_BINDING: "127.0.0.1", DISABLE_IPV6: "true" } })).replace(/^\s*include [^;]+;/gm, "");
        // Nginx 1.24 lacks the Stream deferred option; only the portable test fixture removes it.
        if (process.env.NGINX_SMOKE_PORTABLE_STREAM === "true") rendered = rendered.replaceAll(" deferred", "");
        streams.push(rendered);
    }
    const rootCases = [
        { advanced: "# Example; location / { proxy_pass http://example.test; }", body: "generated-default-proxy" },
        { advanced: 'set $note "# Example; location / { }";', body: "generated-default-proxy" },
        { advanced: 'set $note "escaped \\"; location / { }";', body: "generated-default-proxy" },
        { advanced: "location / { return 200 custom-target; }", body: "custom-target" },
        { advanced: "location '^~' '/' { return 200 prefix-target; }", body: "prefix-target" },
        { advanced: "location = / { return 200 exact-target; }", body: "generated-default-proxy", exact: true },
    ];
    const rootServers = [];
    const aclCases = [
        { directive: "deny", address: "127.0.0.1", status: 403 },
        { directive: "deny", address: "::ffff:127.0.0.1", status: 403 },
        { directive: "deny", address: "::ffff:127.0.0.19/120", status: 403 },
        { directive: "deny", address: "::ffff:127.0.0.1/96", status: 403 },
        { directive: "deny", address: "::ffff:127.0.0.2", status: 200 },
        { directive: "deny", address: "::ffff:127.0.1.0/120", status: 200 },
        { directive: "allow", address: "::ffff:127.0.0.1", status: 200 },
        { directive: "allow", address: "::ffff:127.0.0.19/120", status: 200 },
        { directive: "allow", address: "::ffff:127.0.0.2", status: 403 },
        { directive: "deny", address: "::1", status: 200 },
    ];
    const previousEnvironment = { ...process.env };
    try {
        Object.assign(process.env, { DISABLE_HTTP: "false", IPV4_BINDING: "127.0.0.1",
            DISABLE_IPV6: "true", LISTEN_PROXY_PROTOCOL: "false", DEMO_MODE: "false" });
        for (const [index, item] of rootCases.entries()) {
            item.port = await reservations.reserve();
            process.env.HTTP_PORT = String(item.port);
            const payload = { domain_names: ["root-smoke.test"], forward_scheme: "http",
                forward_host: "127.0.0.1", forward_port: httpUpstream.address().port,
                advanced_config: item.advanced };
            await apiValidator(getValidationSchema("/nginx/proxy-hosts", "post"), payload);
            const rendered = await internalNginx.renderConfig("proxy_host", {
                ...payload, id: 70100 + index, enabled: true, certificate_id: 0, access_list_id: 0, meta: {},
            });
            assert(rendered.includes(item.advanced), "Advanced config must remain verbatim");
            // Isolate root routing from external includes and optional module directives.
            rootServers.push(rendered.replace(/^\s*include [^;]+;/gm, "")
                .replace(/^\s*(?:zstd(?:_static)?|fancyindex)\s+[^;]+;/gm, "")
                .replace(/^\s*access_by_lua_block \{ \}/gm, ""));
        }
        for (const [index, item] of aclCases.entries()) {
            const list = { name: "Address-family controls", satisfy_any: false, pass_auth: true, items: [],
                clients: [{ directive: item.directive, address: item.address },
                    ...(item.directive === "deny" ? [{ directive: "allow", address: "all" }] : [])], meta: {} };
            await apiValidator(getValidationSchema("/nginx/access-lists", "post"), list);
            item.port = await reservations.reserve();
            process.env.HTTP_PORT = String(item.port);
            const rendered = await internalNginx.renderConfig("proxy_host", { id: 70300 + index, enabled: true,
                domain_names: ["acl-smoke.test"], forward_scheme: "http", forward_host: "127.0.0.1",
                forward_port: httpUpstream.address().port, certificate_id: 0, access_list_id: 1, access_list: list, meta: {} });
            rootServers.push(rendered.replace(/^\s*include [^;]+;/gm, "")
                .replace(/^\s*(?:zstd(?:_static)?|fancyindex)\s+[^;]+;/gm, "")
                .replace(/^\s*access_by_lua_block \{ \}/gm, ""));
        }
        await assert.rejects(engine.parseAndRender("{{ rule | nginxAccessRule }}", {
            rule: { directive: "deny", address: "::ffff:127.0.0.1/95" },
        }), /prefix of at least 96/, "Broad mapped networks must not become a partial IPv4 rule");
    } finally {
        for (const name of ["DISABLE_HTTP", "IPV4_BINDING", "DISABLE_IPV6", "LISTEN_PROXY_PROTOCOL", "DEMO_MODE", "HTTP_PORT"]) {
            if (previousEnvironment[name] === undefined) delete process.env[name];
            else process.env[name] = previousEnvironment[name];
        }
    }
    const version = spawnSync(nginxBin, ["-V"], { encoding: "utf8" });
    const build = `${version.stdout || ""}${version.stderr || ""}`;
    let streamModule = process.env.NGINX_STREAM_MODULE;
    if (!streamModule && /--with-stream=dynamic(?:\s|$)/.test(build)) {
        const modulesPath = build.match(/--modules-path=([^\s]+)/)?.[1]?.replace(/^['"]|['"]$/g, "");
        for (const directory of [modulesPath, "/usr/local/nginx/modules", "/usr/lib/nginx/modules", "/etc/nginx/modules"].filter(Boolean)) {
            const candidate = `${directory}/ngx_stream_module.so`;
            if ((await fs.stat(candidate).catch(() => null))?.isFile()) { streamModule = candidate; break; }
        }
        assert(streamModule, "Dynamic Stream module must be available for actual TCP/UDP checks");
    }
    let internalPort;
    if (tcpInternal) {
        internalPort = await reservations.reserve();
    }
    const config = `${directory}/nginx.conf`;
    let configuration = `
${streamModule ? `load_module ${streamModule};` : ""}
${process.getuid?.() === 0 ? "user root;" : ""}
master_process off;
pid ${directory}/nginx.pid;
error_log ${directory}/error.log notice;
events { worker_connections 64; }
http {
    access_log off;
    ${["client_body", "proxy", "fastcgi", "uwsgi", "scgi"].map((name) => `${name}_temp_path ${directory}/${name};`).join("\n")}
    server {
        listen ${tcpInternal ? `127.0.0.1:${internalPort}` : `unix:${socket}`};
        http2 on;
        ${locations.join("\n")}
    }
    ${rootServers.join("\n")}
}
stream { ${streams.join("\n")} }
`;
    await fs.writeFile(config, configuration);
    execFileSync(nginxBin, ["-e", "stderr", "-tq", "-c", config, "-p", `${directory}/`], { stdio: "inherit" });
    running = await withSmokeEndpointRetries({ reservations,
        remap: async (replacements) => {
            for (const item of [...streamCases, ...rootCases, ...aclCases]) {
                item.port = replacements.get(`${item.protocol || "tcp"}:${item.port}`);
            }
            if (internalPort) internalPort = replacements.get(`tcp:${internalPort}`);
            configuration = remapSmokeListeners(configuration, replacements);
            await fs.writeFile(config, configuration);
            // Re-check every replacement; genuine template errors never get retried.
            execFileSync(nginxBin, ["-e", "stderr", "-tq", "-c", config, "-p", `${directory}/`], { stdio: "inherit" });
            console.error("Retrying isolated Nginx after a confirmed IPv4 listener collision");
        },
        run: async () => {
            await fs.rm(socket, { force: true });
            return startSmokeNginx({ nginxBin, config, directory, socket, internalPort });
        },
    });
    client = running.client;
    const payload = frame(Buffer.from("smoke request"));
    for (const item of cases) {
        const query = "?probe=a%26b";
        const requestPath = `${item.route}service.Echo/Call${query}`;
        const response = await new Promise((resolve, reject) => {
            const request = client.request({
                ":method": "POST", ":path": requestPath, "content-type": "application/grpc", te: "trailers", // codespell:ignore te
            });
            const chunks = [];
            let headers;
            request.setTimeout(5000, () => request.destroy(new Error("gRPC echo timed out")));
            request.on("response", (value) => { headers = value; });
            request.on("data", (chunk) => chunks.push(chunk));
            request.on("error", reject);
            request.on("end", () => resolve({ headers, body: Buffer.concat(chunks) }));
            request.end(payload);
        });
        assert.equal(response.headers[":status"], 200, `gRPC route ${item.route} failed`);
        assert.equal(response.headers["content-type"], "application/grpc");
        assert.equal(response.body.readUInt32BE(1), response.body.length - 5);
        assert.deepEqual(JSON.parse(response.body.subarray(5)), {
            method: "POST", path: requestPath,
            body: payload.toString("hex"),
        });
    }
    console.log(`gRPC template smoke passed: ${cases.length} grpc/grpcs IPv4/raw IPv6/bracketed IPv6 default/custom routes; POST, method path, query and body`);
    const streamPayload = Buffer.from("stream\0echo IPv6");
    for (const item of streamCases) {
        const response = await new Promise((resolve, reject) => {
            const connection = item.protocol === "tcp" ? net.connect(item.port, "127.0.0.1") : dgram.createSocket("udp4");
            const chunks = [];
            let settled = false;
            const timer = setTimeout(() => finish(new Error(`${item.protocol} stream echo timed out`)), 5000);
            const finish = (error, data) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (item.protocol === "tcp") connection.destroy();
                else connection.close();
                if (error) reject(error); else resolve(data);
            };
            connection.on("error", (error) => finish(error));
            if (item.protocol === "tcp") {
                connection.once("connect", () => connection.write(streamPayload));
                connection.on("data", (data) => {
                    chunks.push(data);
                    const received = Buffer.concat(chunks);
                    if (received.length >= streamPayload.length) finish(null, received);
                });
            } else {
                connection.once("message", (data) => finish(null, data));
                connection.send(streamPayload, item.port, "127.0.0.1");
            }
        });
        assert.deepEqual(response, streamPayload, `${item.protocol} ${item.address} stream must preserve all bytes`);
    }
    console.log(`Stream template smoke passed: ${streamCases.length} TCP/UDP IPv4/raw IPv6/bracketed IPv6 routes; complete echo bytes`);
    let rootRequests = 0;
    for (const item of rootCases) {
        const response = await fetch(`http://127.0.0.1:${item.port}/probe`, { signal: AbortSignal.timeout(5000) });
        assert.equal(response.status, 200);
        assert.equal(await response.text(), item.body, `Advanced config ${item.advanced} must preserve root routing`);
        rootRequests++;
        if (item.exact) {
            const exact = await fetch(`http://127.0.0.1:${item.port}/`, { signal: AbortSignal.timeout(5000) });
            assert.equal(exact.status, 200);
            assert.equal(await exact.text(), "exact-target");
            rootRequests++;
        }
    }
    console.log(`Advanced root template smoke passed: ${rootRequests} HTTP requests; comments, quoted/escaped arguments, prefix and exact root controls`);
    for (const item of aclCases) {
        const response = await fetch(`http://127.0.0.1:${item.port}/probe`, { signal: AbortSignal.timeout(5000) });
        assert.equal(response.status, item.status, `${item.directive} ${item.address} must match the correct family`);
        if (item.status === 200) assert.equal(await response.text(), "generated-default-proxy");
        else await response.text();
    }
    console.log(`Access-rule template smoke passed: ${aclCases.length} HTTP requests; mapped single/CIDR allow/deny, match/mismatch and native family controls; broad mapped CIDR rejected`);
} catch (error) {
    console.error(await fs.readFile(`${directory}/error.log`, "utf8").catch(() => ""));
    throw error;
} finally {
    client?.destroy();
    for (const session of sessions) session.destroy();
    if (running) await stopSmokeNginx(running);
    await reservations.release();
    await new Promise((resolve) => upstream.close(resolve));
    if (secureUpstream) await new Promise((resolve) => secureUpstream.close(resolve));
    await new Promise((resolve) => tcpUpstream.close(resolve));
    udpUpstream.close();
    httpUpstream.closeAllConnections();
    await new Promise((resolve) => httpUpstream.close(resolve));
    await fs.rm(socket, { force: true });
    await fs.rm(directory, { recursive: true, force: true });
}
GRPC_SMOKE

# Use the image's implementation and templates for IP/country/ASN runtime checks.
sed 's|../../backend/|/app/|g' "$(dirname "$0")/ip-firewall-smoke.mjs" > "$fixture/ip-firewall-smoke.mjs"
cp "$(dirname "$0")/nginx-smoke-modules.mjs" "$fixture/nginx-smoke-modules.mjs"
cp "$(dirname "$0")/nginx-smoke-endpoints.mjs" "$fixture/nginx-smoke-endpoints.mjs"
cp "$(dirname "$0")/mmdb-oracle.py" "$fixture/mmdb-oracle.py"
cp "$(dirname "$0")/fixtures/GeoIP2-Country-Test.mmdb" "$fixture/GeoIP2-Country-Test.mmdb"
cp "$(dirname "$0")/fixtures/GeoLite2-ASN-Test.mmdb" "$fixture/GeoLite2-ASN-Test.mmdb"
# Enable the image's real startup configuration with three offline test databases.
mkdir -p "$fixture/nginx"
cp "$fixture/GeoIP2-Country-Test.mmdb" "$fixture/nginx/GeoLite2-Country.mmdb"
cp "$(dirname "$0")/fixtures/GeoIP2-City-Test.mmdb" "$fixture/nginx/GeoLite2-City.mmdb"
cp "$fixture/GeoLite2-ASN-Test.mmdb" "$fixture/nginx/GeoLite2-ASN.mmdb"

for service_uid in 0 1000; do
    container="shieldpm-smoke-${fixture##*/}-$service_uid"
    volume="$container-data"
    docker_cmd volume create "$volume" >/dev/null
    volumes+=("$volume")
    containers+=("$container")
    docker_cmd create --name "$container" --pull never --network none \
        --mount "type=volume,source=$volume,target=/data" \
        --health-interval 5s --health-timeout 10s --health-start-period 5s --health-retries 3 \
        --env TZ=UTC --env PUID="$service_uid" --env PGID="$service_uid" \
        --env DISABLE_IPV6=true --env SKIP_IP_RANGES=true \
        --env GEOIP_AUTO_UPDATE=false \
        --env NGINX_LOAD_GEOIP2_MODULE=true \
        --env TOR_ENABLED=false --env ANUBIS_ENABLED=false \
        --env ACME_OCSP_STAPLING=false --env CUSTOM_OCSP_STAPLING=false \
        "$image" >/dev/null
    docker_cmd cp "$fixture/." "$container:/data/"
    docker_cmd start "$container" >/dev/null

    deadline=$((SECONDS + health_timeout))
    healthy=false
    while (( SECONDS < deadline )); do
        state=$(docker_cmd inspect --format '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container")
        if [[ "$state" == "true healthy" ]]; then
            healthy=true
            break
        fi
        if [[ "$state" != true\ * ]]; then
            echo "Container exited before becoming healthy (UID $service_uid)" >&2
            exit 1
        fi
        sleep 2
    done
    if [[ "$healthy" != true ]]; then
        echo "Healthcheck timed out after ${health_timeout}s (UID $service_uid)" >&2
        exit 1
    fi

    # Use the actual service UID for writes, Nginx validation/reload and HTTP health.
    # These expansions belong to the container's shell.
    # shellcheck disable=SC2016
    docker_cmd exec --user "$service_uid:$service_uid" "$container" sh -ceu '
        test "$(id -u)" = "$1"
        test -S /run/shieldpm/shieldpm.sock
        test "$(stat -c %u /run/shieldpm/shieldpm.sock)" = "$1"
        test -s /data/nginx/default.conf
        printf "\n# CI runtime write probe\n" >> /data/nginx/default.conf
        test -d /data/certbot-plugins
        : > /data/certbot-plugins/.ci-write-probe
        rm /data/certbot-plugins/.ci-write-probe
        test -d /data/logs
        test "$(stat -c %u /data/logs)" = "$1"
        test "$(stat -c %g /data/logs)" = "$1"
        test "$(stat -c %a /data/logs)" = 700
        test "$(head -n 1 /data/logs/ip_firewall_ci.log)" = "CI retained firewall log marker"
        if test "$1" = 1000; then
            grep -Fxq "CI service UID 0 append probe" /data/logs/ip_firewall_ci.log
        fi
        printf "%s\n" "CI service UID $1 append probe" >> /data/logs/ip_firewall_ci.log
        grep -Fxq "CI service UID $1 append probe" /data/logs/ip_firewall_ci.log
        : > /data/logs/.ci-write-probe
        rm /data/logs/.ci-write-probe
        for directory in /run /tmp /usr/local; do
            test "$(stat -c %u "$directory")" = 0
        done
        nginx -e stderr -tq
        nginx -e stderr -s reload
        healthcheck.sh
        node /data/grpc-smoke.mjs
        # Reuse the image module paths and require the actual ModSecurity directive.
        NGINX_SMOKE_DISCOVER_MODULES=true NGINX_REQUIRE_MODSECURITY=true \
            NGINX_GEOIP_DATABASE=/data/GeoIP2-Country-Test.mmdb \
            NGINX_ASN_DATABASE=/data/GeoLite2-ASN-Test.mmdb NGINX_REQUIRE_ASN_STARTUP=true \
            node /data/ip-firewall-smoke.mjs
    ' smoke "$service_uid"
    if [[ "$service_uid" == 0 ]]; then
        # The next service UID starts with the retained log written by UID0.
        docker_cmd cp "$container:/data/logs/ip_firewall_ci.log" "$fixture/logs/ip_firewall_ci.log"
    fi
    echo "Docker runtime smoke passed (UID $service_uid, $image_arch)"
done
