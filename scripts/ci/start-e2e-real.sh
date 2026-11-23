#!/usr/bin/env bash
# Start a real backend and the Vite dev server for the browser E2E.
#
# The backend is real (Express, SQLite, migrations, setup, auth, API). Nginx is
# replaced by a tiny stub so the runner does not need a full proxy installation;
# the test still exercises the real config generation and database paths.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
case "${CI:-}" in
	true | 1) ;;
	*)
		echo "This script resets /data and is intended for the CI browser job only." >&2
		exit 1
		;;
esac
DATA="/data"
BIN="$ROOT/e2e-bin"
TOKEN="${E2E_SETUP_TOKEN:-e2e-token}"

sudo mkdir -p "$DATA" /run/shieldpm
sudo chown "$(id -u):$(id -g)" "$DATA" /run/shieldpm
sudo rm -f /run/shieldpm/shieldpm.sock
find "$DATA" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
rm -rf "$BIN"
mkdir -p "$DATA/nginx" "$BIN"

cat > "$BIN/nginx" <<'STUB'
#!/usr/bin/env bash
# The E2E verifies the application, not the Nginx binary.
exit 0
STUB
chmod +x "$BIN/nginx"

cd "$ROOT/backend"
DATA_PATH="$DATA" PATH="$BIN:$PATH" SETUP_TOKEN="$TOKEN" SKIP_IP_RANGES=true node index.js \
	>"$ROOT/e2e-backend.log" 2>&1 &
BACKEND_PID=$!

cleanup() {
	kill "$BACKEND_PID" 2>/dev/null || true
	kill "${SOCAT_PID:-}" 2>/dev/null || true
	kill "${VITE_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 120); do
	if [ -S /run/shieldpm/shieldpm.sock ]; then break; fi
	sleep 1
done
if [ ! -S /run/shieldpm/shieldpm.sock ]; then
	echo "Backend did not create its socket; log follows:" >&2
	cat "$ROOT/e2e-backend.log" >&2
	exit 1
fi

socat TCP-LISTEN:3000,fork,reuseaddr UNIX-CONNECT:/run/shieldpm/shieldpm.sock &
SOCAT_PID=$!

cd "$ROOT/frontend"
node_modules/.bin/vite --host 127.0.0.1 --port 4173 --strictPort &
VITE_PID=$!
wait "$VITE_PID"
