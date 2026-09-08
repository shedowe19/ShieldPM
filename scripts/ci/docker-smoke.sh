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

# Render the image's actual forwarding templates and exercise their gRPC directives
# against a local HTTP/2 echo service. The separate Nginx process cannot affect app listeners.
cat > "$fixture/grpc-smoke.mjs" <<'GRPC_SMOKE'
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import http2 from "node:http2";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import utils from "/app/lib/utils.js";

const directory = "/data/nginx/grpc-smoke";
const socket = "/run/shieldpm/grpc-smoke.sock";
const sessions = new Set();
const frame = (body) => {
    const header = Buffer.alloc(5);
    header.writeUInt32BE(body.length, 1);
    return Buffer.concat([header, body]);
};
const upstream = http2.createServer();
upstream.on("session", (session) => {
    sessions.add(session);
    session.on("close", () => sessions.delete(session));
});
upstream.on("stream", (stream, headers) => {
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

let nginx;
let exited;
let client;
let nginxError;
try {
    await fs.mkdir(directory, { recursive: true });
    upstream.listen(0, "127.0.0.1");
    await once(upstream, "listening");
    const engine = utils.getRenderEngine();
    const base = {
        id: 70001, use_default_location: true, forward_scheme: "grpc",
        forward_host: "127.0.0.1", forward_port: upstream.address().port, access_list_id: 0,
    };
    const cases = [
        { route: "/default/", template: "_proxy_logic.conf" },
        { route: "/custom/", template: "_proxy_host_custom_location.conf" },
    ];
    const locations = [];
    for (const item of cases) {
        const rendered = await engine.renderFile(item.template, { ...base, path: item.route });
        const directives = rendered.match(/^\s*grpc_pass [^;]+;/gm) || [];
        assert.equal(directives.filter((line) => line.trim().startsWith("grpc_pass ")).length, 1);
        locations.push(`location ${item.route} { ${directives.join("\n")} }`);
    }
    const config = `${directory}/nginx.conf`;
    await fs.writeFile(config, `
master_process off;
pid ${directory}/nginx.pid;
error_log ${directory}/error.log notice;
events { worker_connections 64; }
http {
    access_log off;
    client_body_temp_path ${directory}/body;
    server {
        listen unix:${socket};
        http2 on;
        ${locations.join("\n")}
    }
}
`);
    execFileSync("nginx", ["-tq", "-c", config, "-p", `${directory}/`], { stdio: "inherit" });
    nginx = spawn("nginx", ["-c", config, "-p", `${directory}/`, "-g", "daemon off;"], { stdio: "inherit" });
    nginx.on("error", (error) => { nginxError = error; });
    exited = once(nginx, "exit").catch(() => {});
    const deadline = Date.now() + 5000;
    while (!(await fs.stat(socket).catch(() => null))?.isSocket()) {
        if (nginxError) throw nginxError;
        assert.equal(nginx.exitCode, null, "isolated Nginx exited before opening its socket");
        assert.ok(Date.now() < deadline, "isolated Nginx socket did not become ready");
        await delay(25);
    }
    client = http2.connect("http://localhost", { createConnection: () => net.connect(socket) });
    client.on("error", () => {});
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
    console.log("gRPC template smoke passed: default/custom POST, method path, query and body");
} catch (error) {
    console.error(await fs.readFile(`${directory}/error.log`, "utf8").catch(() => ""));
    throw error;
} finally {
    client?.destroy();
    for (const session of sessions) session.destroy();
    if (nginx && nginx.exitCode === null && !nginxError) {
        nginx.kill("SIGQUIT");
        await Promise.race([exited, delay(3000)]);
        if (nginx.exitCode === null && nginx.signalCode === null) {
            nginx.kill("SIGKILL");
            await exited;
        }
    }
    await new Promise((resolve) => upstream.close(resolve));
    await fs.rm(socket, { force: true });
    await fs.rm(directory, { recursive: true, force: true });
}
GRPC_SMOKE

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
        for directory in /run /tmp /usr/local; do
            test "$(stat -c %u "$directory")" = 0
        done
        nginx -tq
        nginx -s reload
        healthcheck.sh
        node /data/grpc-smoke.mjs
    ' smoke "$service_uid"
    echo "Docker runtime smoke passed (UID $service_uid, $image_arch)"
done
