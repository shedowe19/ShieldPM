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

if [ -n "$(ls -A /data/prerun 2> /dev/null)" ] && [ "$ENABLE_PRERUN" = "true" ]; then
    for script in /data/prerun/*.sh; do
        echo "Exexcuting prerun script: $script"
        chmod +x "$script"
        "$script"
    done
fi

exec envs.sh
