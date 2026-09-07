#!/usr/bin/env sh

# Docker health checks run in a new process and do not inherit exports made by
# entrypoint.sh. Native installations also configure their ports in this file.
if [ -f /data/.env ]; then
    # shellcheck source=/dev/null
    . /data/.env
fi

export GOA="${GOA:-false}"
export GOA_PORT="${GOA_PORT:-91}"
export GOA_IPV4_BINDING="${GOA_IPV4_BINDING:-0.0.0.0}"
if [ "$GOA_IPV4_BINDING" = "0.0.0.0" ]; then
    export GOA_IPV4_BINDING="127.0.0.1"
fi

export PHP82="${PHP82:-false}"
export PHP83="${PHP83:-false}"
export PHP84="${PHP84:-false}"

export NPM_PORT="${NPM_PORT:-81}"
export NPM_IPV4_BINDING="${NPM_IPV4_BINDING:-0.0.0.0}"
if [ "$NPM_IPV4_BINDING" = "0.0.0.0" ]; then
    export NPM_IPV4_BINDING="127.0.0.1"
fi

if (if [ "$GOA" = "true" ]; then [ -f /tmp/goa/index.html ] && nc -z -w 5 "$GOA_IPV4_BINDING" "$GOA_PORT"; fi && if [ "$PHP82" = true ]; then cgi-fcgi -bind -connect /run/php82.sock > /dev/null 2>&1; fi && if [ "$PHP83" = true ]; then cgi-fcgi -bind -connect /run/php83.sock > /dev/null 2>&1; fi && if [ "$PHP84" = true ]; then cgi-fcgi -bind -connect /run/php84.sock > /dev/null 2>&1; fi && [ "$(curl -fsSk --max-time 10 https://"$NPM_IPV4_BINDING":"$NPM_PORT"/api/ | jq --raw-output .status)" = "OK" ]); then
	echo "OK"
	exit 0
else
	echo "NOT OK"
	exit 1
fi
