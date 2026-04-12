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

# Re-install apt addons from persistent manifests.
# apt packages are not persistent across container recreations, so we re-install
# them on every startup by reading the manifests saved in the /data volume.
if [ -d "/data/addons" ]; then
    _apt_packages=""
    for _manifest in /data/addons/*/manifest.json; do
        [ -f "$_manifest" ] || continue
        _type=$(grep -o '"type"[[:space:]]*:[[:space:]]*"[^"]*"' "$_manifest" | sed 's/.*"type"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
        if [ "$_type" = "apt" ]; then
            _pkgs=$(grep -o '"apt_packages"[[:space:]]*:[[:space:]]*\[[^]]*\]' "$_manifest" \
                | grep -o '"[a-zA-Z0-9._+-]*"' \
                | tr -d '"' \
                | tr '\n' ' ')
            _apt_packages="$_apt_packages $_pkgs"
        fi
    done
    if [ -n "$(echo "$_apt_packages" | tr -d ' ')" ]; then
        echo "Re-installing apt addons:$_apt_packages"
        # shellcheck disable=SC2086
        apt-get install -y --no-install-recommends $_apt_packages && rm -rf /var/lib/apt/lists/*
    fi
fi

exec envs.sh
