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
    ' smoke "$service_uid"
    echo "Docker runtime smoke passed (UID $service_uid, $image_arch)"
done
