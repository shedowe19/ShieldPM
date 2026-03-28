#!/usr/bin/env sh

export ENABLE_PRERUN="${ENABLE_PRERUN:-false}"
if ! echo "$ENABLE_PRERUN" | grep -q "^true$\|^false$"; then
    echo "ENABLE_PRERUN needs to be true or false."
    sleep inf
fi

# Migration from npmplus to shieldpm folder structure
if [ -d "/data/npmplus" ] && [ ! -d "/data/shieldpm" ]; then
    echo "Migrating data directory from npmplus to shieldpm..."
    mv /data/npmplus /data/shieldpm
    echo "Migration complete."
fi

# Populate CrowdSec Data Directory
if [ -d "/etc/crowdsec" ]; then
    mkdir -p /data/crowdsec
    cp -u /etc/crowdsec/*.yaml /data/crowdsec/
fi

if [ -n "$(ls -A /data/prerun 2> /dev/null)" ] && [ "$ENABLE_PRERUN" = "true" ]; then
    for script in /data/prerun/*.sh; do
        echo "Exexcuting prerun script: $script"
        chmod +x "$script"
        "$script"
    done
fi

# Start guacd (Guacamole proxy daemon — required for RDP via FreeRDP/NLA)
if command -v guacd >/dev/null 2>&1; then
    guacd -b 127.0.0.1 -l 4822 -L error
    echo "[entrypoint] guacd started on 127.0.0.1:4822"
else
    echo "[entrypoint] WARNING: guacd not found — RDP support unavailable"
fi

exec envs.sh
