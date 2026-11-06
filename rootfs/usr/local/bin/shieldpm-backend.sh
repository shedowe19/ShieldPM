#!/bin/sh

# Only an explicitly requested database transition restarts the backend here.
# Unexpected exits still reach launch.sh's critical-service supervision.
backend_child=
stop_backend() {
    trap '' INT TERM
    if [ -n "$backend_child" ]; then
        kill -TERM "$backend_child" 2>/dev/null || true
        wait "$backend_child" 2>/dev/null || true
    fi
    exit 0
}
trap stop_backend INT TERM

while true; do
    node index.js &
    backend_child=$!
    wait "$backend_child"
    backend_status=$?
    backend_child=
    if [ "$backend_status" -ne 75 ]; then
        exit "$backend_status"
    fi
    echo "ShieldPM requested a database transition; restarting backend in maintenance."
done
