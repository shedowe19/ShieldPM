#!/usr/bin/env bash
# Verify real provider downloads using the built image, separate from the offline app smoke.
set -Eeuo pipefail

image=${1:?Usage: geoip-update-smoke.sh IMAGE}
container_environment=()
if [[ -n "${GEOIP_GITHUB_TOKEN:-}" ]]; then
    # Pass only the variable name so credentials never appear in CLI arguments.
    container_environment+=(--env GEOIP_GITHUB_TOKEN)
fi
docker_cmd() { timeout 30s docker "$@"; }
image_arch=$(docker_cmd image inspect --format '{{.Architecture}}' "$image")
case "$(uname -m):$image_arch" in
    x86_64:amd64|aarch64:arm64) ;;
    *) echo "GeoIP bootstrap smoke requires the runner's native architecture" >&2; exit 1 ;;
esac

temporary=$(mktemp -d)
volume="shieldpm-geoip-${temporary##*/}"
containers=()
volume_created=false
cleanup() {
    local result=$?
    trap - EXIT
    set +e
    if (( result != 0 )); then
        for container in "${containers[@]}"; do
            docker_cmd logs --tail 100 "$container" >&2
        done
    fi
    for container in "${containers[@]}"; do
        docker_cmd rm --force "$container" >/dev/null || result=1
    done
    if [[ "$volume_created" == true ]]; then
        docker_cmd volume rm "$volume" >/dev/null || result=1
    fi
    rm -rf -- "$temporary"
    exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

volume_created=true
docker_cmd volume create "$volume" >/dev/null
bootstrap=$(cat <<'BOOTSTRAP'
if [ "$1" = 1 ]; then
    for kind in Country City ASN; do
        test ! -e "/data/nginx/GeoLite2-$kind.mmdb"
    done
fi
python3 /usr/local/bin/update-geoip.py --directory /data/nginx 2>&1 | tee /data/.ci-geoip-update.log
python3 - "$1" <<'PY'
import ctypes
import ctypes.util
import hashlib
import json
from pathlib import Path
import re
import sys

library = ctypes.CDLL(ctypes.util.find_library("maxminddb") or "libmaxminddb.so.0")
assert library.MMDB_open and library.MMDB_close
directory = Path("/data/nginx")
update_log = Path("/data/.ci-geoip-update.log").read_text()
ready = re.findall(r"\[GeoIP\] Release (.+) ready; (\d+) updated, (\d+) unchanged", update_log)
assert len(ready) == 1, "Latest metadata was not successfully checked"
release, updated, unchanged = ready[0]
updated, unchanged = int(updated), int(unchanged)
assert updated + unchanged == 3
snapshot = {}
for kind in ("Country", "City", "ASN"):
    filename = directory / f"GeoLite2-{kind}.mmdb"
    stat = filename.stat()
    assert filename.is_file() and stat.st_size > 0
    with filename.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    snapshot[filename.name] = {
        "inode": stat.st_ino, "size": stat.st_size, "mtime_ns": stat.st_mtime_ns,
        "sha256": digest,
    }
manifest = directory / ".ci-geoip-snapshot.json"
if sys.argv[1] == "1":
    assert (updated, unchanged) == (3, 0), "Empty first boot must download all databases"
    manifest.write_text(json.dumps(snapshot))
    print("GeoIP bootstrap smoke: first boot verified all 3 runtime databases")
else:
    previous = json.loads(manifest.read_text())
    changed = 0
    for name, current in snapshot.items():
        if current["sha256"] == previous[name]["sha256"]:
            assert current == previous[name], "Unchanged database inode, mtime or size was replaced"
        else:
            changed += 1
    assert (updated, unchanged) == (changed, 3 - changed), "Update counts do not match changed database bytes"
    if changed:
        print(f"GeoIP bootstrap smoke: second boot advanced latest snapshot; {changed} updated, {3 - changed} unchanged")
    else:
        assert "[GeoIP] Downloading " not in update_log, "Unchanged assets were downloaded again"
        print("GeoIP bootstrap smoke: second boot retained all 3 database inodes and hashes")
print(f"GeoIP bootstrap smoke: validated latest release {release}")
print(json.dumps(snapshot, sort_keys=True))
PY
BOOTSTRAP
)

for boot in 1 2; do
    container="shieldpm-geoip-${temporary##*/}-$boot"
    containers+=("$container")
    docker_cmd create --name "$container" --pull never --network bridge \
        "${container_environment[@]}" \
        --mount "type=volume,source=$volume,target=/data" \
        --entrypoint bash "$image" -Eeuo pipefail -c "$bootstrap" smoke "$boot" >/dev/null
    # The helper's total network budget is 240s; allow 30s for validation/snapshot work.
    timeout 270s docker start --attach "$container" 2>&1 | tee "$temporary/boot-$boot.log"
    if [[ "$(docker_cmd inspect --format '{{.State.ExitCode}}' "$container")" != 0 ]]; then
        echo "GeoIP bootstrap container failed (boot $boot)" >&2
        exit 1
    fi
    if [[ "$boot" == 1 ]]; then
        grep -Eq '\[GeoIP\] Release .+ ready; 3 updated, 0 unchanged' "$temporary/boot-$boot.log"
        grep -Fq 'GeoIP bootstrap smoke: first boot verified all 3 runtime databases' "$temporary/boot-$boot.log"
    else
        if grep -Fq 'GeoIP bootstrap smoke: second boot retained all 3 database inodes and hashes' "$temporary/boot-$boot.log"; then
            grep -Eq '\[GeoIP\] Release .+ ready; 0 updated, 3 unchanged' "$temporary/boot-$boot.log"
            if grep -Fq '[GeoIP] Downloading ' "$temporary/boot-$boot.log"; then
                echo "Unchanged GeoIP snapshot was downloaded again" >&2
                exit 1
            fi
        else
            grep -Eq '\[GeoIP\] Release .+ ready; [1-3] updated, [0-2] unchanged' "$temporary/boot-$boot.log"
            grep -Eq 'GeoIP bootstrap smoke: second boot advanced latest snapshot; [1-3] updated, [0-2] unchanged' "$temporary/boot-$boot.log"
        fi
    fi
done
echo "Docker GeoIP bootstrap smoke passed (2 boots, 3 databases, $image_arch)"
