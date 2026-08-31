#!/usr/bin/env bash

echo "
-------------------------------------
  ____  _     _      _     _ ____  __  __
 / ___|| |__ (_) ___| | __| |  _ \|  \/  |
 \___ \| '_ \| |/ _ \ |/ _\` | |_) | |\/| |
  ___) | | | | |  __/ | (_| |  __/| |  | |
 |____/|_| |_|_|\___|_|\__,_|_|   |_|  |_|
-------------------------------------
Version:  $(jq -r .version /app/package.json)
Date:     $(date)
-------------------------------------
"


if [ "$(whoami)" != "root" ] || [ "$(id -u)" != "0" ] || [ "$(id -g)" != "0" ]; then
	echo "-----------------------------------------------------------------------------------------------"
	echo "This docker container must be run as root, do not specify a user. Please use PUID/PGID instead."
	echo "-----------------------------------------------------------------------------------------------"
    sleep inf
fi

if [ ! -d /data ]; then
	echo "----------------------------------------------"
	echo "/data is not mounted! Creating it..."
	echo "----------------------------------------------"
    mkdir -p /data
fi


touch /data/.env
set -a
# shellcheck source=/dev/null
. /data/.env
set +a

# Resolve generic FOO_FILE variables before validation and all child processes.
# shellcheck source=/usr/local/bin/load-env-secrets.sh
. /usr/local/bin/load-env-secrets.sh || exit 1


# Run Node.js validation script
# Capture output to evaluate exports
# We redirect stderr to &2 so errors show up
VALIDATION_OUTPUT=$(node /app/validate-env.cjs)
VALIDATION_EXIT_CODE=$?

if [ $VALIDATION_EXIT_CODE -ne 0 ]; then
    # If the script failed, it should have printed the error to stderr
    echo "Validation failed."
    sleep inf
fi

# Eval the exported variables
eval "$VALIDATION_OUTPUT"


# Template Version Hash Check (kept in shell for simplicity as it involves piping many unix tools)
export TV="5c"
if [ ! -s /data/shieldpm/env.sha512sum ] || [ "$(cat /data/shieldpm/env.sha512sum)" != "$( (grep "env\.[A-Z0-9_]\+" -roh /app/templates | sed "s|env.||g" | sort | uniq | xargs printenv; echo "$TV") | tr -d "\n" | sha512sum | cut -d" " -f1)" ]; then
    echo "At least one env or the template version changed, all hosts will be regenerated."
    export REGENERATE_ALL="true"
fi

exec migration.sh
