#!/usr/bin/env sh

echo "
-------------------------------------
User:     $(whoami)
PUID:     $PUID
User ID:  $(id -u)
PGID:     $PGID
Group ID: $(id -g)
-------------------------------------
"

if [ -z "$(find /data/tls/certbot/accounts/"$(echo "$ACME_SERVER" | sed "s|^https\?://\([^/]\+\).*$|\1|g")" -type f 2> /dev/null)" ]; then
    if [ "$(echo "$ACME_SERVER" | sed "s|^https\?://\([^/]\+\).*$|\1|g")" = "acme.zerossl.com" ] && [ -z "$ACME_EAB_KID" ] && [ -z "$ACME_EAB_HMAC_KEY" ]; then
        if [ -z "$ACME_EMAIL" ]; then
            echo "ACME_EMAIL is required to use zerossl. Either set it or use a different acme server like letsencrypt (ACME_SERVER: https://acme-v02.api.letsencrypt.org/directory)"
            sleep inf
        fi

        ZS_EAB="$(curl -sSL https://api.zerossl.com/acme/eab-credentials-email --data "email=$ACME_EMAIL")"
        export ZS_EAB
        ACME_EAB_KID="$(echo "$ZS_EAB" | jq -r .eab_kid)"
        export ACME_EAB_KID
        ACME_EAB_HMAC_KEY="$(echo "$ZS_EAB" | jq -r .eab_hmac_key)"
        export ACME_EAB_HMAC_KEY
    fi
    if [ -z "$ACME_EMAIL" ]; then
        if ! certbot --config /etc/certbot.ini register --server "$ACME_SERVER" --register-unsafely-without-email; then
                    sleep inf
        fi
    elif [ -n "$ACME_EMAIL" ] && [ -z "$ACME_EAB_KID" ] && [ -z "$ACME_EAB_HMAC_KEY" ]; then
        if ! certbot --config /etc/certbot.ini register --server "$ACME_SERVER" --email "$ACME_EMAIL"; then
                    sleep inf
        fi
    elif [ -n "$ACME_EMAIL" ] && [ -n "$ACME_EAB_KID" ] && [ -n "$ACME_EAB_HMAC_KEY" ]; then
        if ! certbot --config /etc/certbot.ini register --server "$ACME_SERVER" --eab-kid "$ACME_EAB_KID" --eab-hmac-key "$ACME_EAB_HMAC_KEY" --email "$ACME_EMAIL"; then
                    sleep inf
        fi
    fi
    echo
fi

if [ "$ACME_OCSP_STAPLING" = "true" ]; then
    certbot-ocsp-fetcher.sh -c /data/tls/certbot/live -o /data/tls/certbot/live --no-reload-webserver --force-update || true
    echo
fi
if [ "$CUSTOM_OCSP_STAPLING" = "true" ]; then
    certbot-ocsp-fetcher.sh -c /data/tls/custom -o /data/tls/custom --no-reload-webserver --force-update || true
    echo
fi


if ! nginx -tq; then
    echo "WARNING: Nginx configuration test failed!"
    echo "Attempting to disable broken proxy hosts with missing certificates..."
    for conf in /data/nginx/proxy_host/*.conf /data/nginx/redirection_host/*.conf /data/nginx/dead_host/*.conf /data/nginx/stream/*.conf; do
        if [ -f "$conf" ]; then
            # Extract certificate paths referenced in the config
            missing_certs=$(grep -oE '/data/tls/certbot/live/npm-[0-9]+/fullchain\.pem|/data/tls/custom/npm-[0-9]+/fullchain\.pem' "$conf" || true)
            for cert in $missing_certs; do
                if [ ! -f "$cert" ]; then
                    echo "Deleting $conf because $cert is missing!"
                    rm -f "$conf"
                    break
                fi
            done
        fi
    done
    echo "Retesting Nginx configuration..."
    if ! nginx -tq; then
        echo "Nginx configuration STILL fails. Continuing anyway..."
    fi
fi
if [ "$PHP82" = "true" ]; then
    if ! PHP_INI_SCAN_DIR=/data/php/82/conf.d php-fpm8.2 -c /data/php/82 -y /data/php/82/php-fpm.conf -FORt > /dev/null 2>&1; then
        PHP_INI_SCAN_DIR=/data/php/82/conf.d php-fpm8.2 -c /data/php/82 -y /data/php/82/php-fpm.conf -FORt
        sleep inf
    fi
fi
if [ "$PHP83" = "true" ]; then
    if ! PHP_INI_SCAN_DIR=/data/php/83/conf.d php-fpm8.3 -c /data/php/83 -y /data/php/83/php-fpm.conf -FORt > /dev/null 2>&1; then
        PHP_INI_SCAN_DIR=/data/php/83/conf.d php-fpm8.3 -c /data/php/83 -y /data/php/83/php-fpm.conf -FORt
        sleep inf
    fi
fi
if [ "$PHP84" = "true" ]; then
    if ! PHP_INI_SCAN_DIR=/data/php/84/conf.d php-fpm8.4 -c /data/php/84 -y /data/php/84/php-fpm.conf -FORt > /dev/null 2>&1; then
        PHP_INI_SCAN_DIR=/data/php/84/conf.d php-fpm8.4 -c /data/php/84 -y /data/php/84/php-fpm.conf -FORt
        sleep inf
    fi
fi


echo "Starting services..."
shutdown_requested=false
backend_pid=""

# Invoked indirectly by the TERM/INT trap below.
# shellcheck disable=SC2317
request_shutdown() {
    shutdown_requested=true
    if [ -n "$backend_pid" ] && kill -0 "$backend_pid" 2>/dev/null; then
        kill -TERM "$backend_pid" 2>/dev/null || true
    fi
}

terminate_tree() {
    parent_pid="$1"
    for child_pid in $(pgrep -P "$parent_pid" 2>/dev/null || true); do
        terminate_tree "$child_pid"
        kill -TERM "$child_pid" 2>/dev/null || true
    done
}

trap request_shutdown TERM INT
if [ "${TOR_ENABLED:-true}" = "true" ] && command -v tor >/dev/null 2>&1; then
    echo "Starting Tor daemon..."
    tor -f /etc/tor/torrc &
fi
# Determine Anubis binary path
ANUBIS_BIN=""
if [ -x "/usr/local/bin/anubis" ]; then
    ANUBIS_BIN="/usr/local/bin/anubis"
elif command -v anubis >/dev/null 2>&1; then
    ANUBIS_BIN="anubis"
fi

if [ "${ANUBIS_ENABLED:-true}" = "true" ] && [ -n "$ANUBIS_BIN" ]; then
    echo "Starting Anubis ($ANUBIS_BIN)..."
    mkdir -p /run/anubis
    mkdir -p /run/nginx
    mkdir -p /data/anubis

    ANUBIS_ARGS="-bind-network unix -bind /run/anubis/nginx.sock -target unix:///run/nginx/anubis-upstream.sock -socket-mode 0777"

    # Check for custom policy file
    if [ -f /data/anubis/policy.yaml ]; then
        echo "  > Using custom policy: /data/anubis/policy.yaml"
        ANUBIS_ARGS="$ANUBIS_ARGS -policy-fname /data/anubis/policy.yaml"
    elif [ -f /data/anubis/policy.json ]; then
        echo "  > Using custom policy: /data/anubis/policy.json"
        ANUBIS_ARGS="$ANUBIS_ARGS -policy-fname /data/anubis/policy.json"
    fi

    # Run Anubis in a loop to restart on failure (clearing socket first)
    (
      while true; do
        rm -f /run/anubis/nginx.sock
        # shellcheck disable=SC2086
        $ANUBIS_BIN $ANUBIS_ARGS
        sleep 1
      done
    ) &
fi
aio.sh &
if [ "$PHP82" = "true" ]; then while true; do PHP_INI_SCAN_DIR=/data/php/82/conf.d php-fpm8.2 -c /data/php/82 -y /data/php/82/php-fpm.conf -FOR; done; fi &
if [ "$PHP83" = "true" ]; then while true; do PHP_INI_SCAN_DIR=/data/php/83/conf.d php-fpm8.3 -c /data/php/83 -y /data/php/83/php-fpm.conf -FOR; done; fi &
if [ "$PHP84" = "true" ]; then while true; do PHP_INI_SCAN_DIR=/data/php/84/conf.d php-fpm8.4 -c /data/php/84 -y /data/php/84/php-fpm.conf -FOR; done; fi &
if [ "$LOGROTATE" = "true" ]; then while true; do logrotate --verbose --state /data/logrotate.state /etc/logrotate; sleep 25h; done; fi &
# shellcheck disable=SC2086
if [ "$GOA" = "true" ]; then while true; do if [ -f /data/nginx/json_access.log ]; then tail -F /data/nginx/json_access.log | jq --unbuffered -R -r 'try (fromjson | "[" + .time_local + "] " + .http_host + " " + .remote_addr + " " + .request_time + " \"" + (.request | gsub("\""; "\\\"")) + "\" " + .status + " " + .body_bytes_sent + " " + .bytes_sent + " \"" + (.http_referer | gsub("\""; "\\\"")) + "\" \"" + (.http_user_agent | gsub("\""; "\\\"")) + "\"") catch empty' | goaccess --no-global-config --num-tests=0 --tz="$TZ" --time-format="%H:%M:%S" \
                    --date-format="%d/%b/%Y" --log-format='[%d:%t %^] %v %h %T "%r" %s %b %b "%R" "%u"' --unix-socket=/run/goaccess.sock --log-file=- \
                    --real-time-html --output=/tmp/goa/index.html --persist --restore --db-path=/data/goaccess/data \
                    --browsers-file=/etc/goaccess/browsers.list --browsers-file=/etc/goaccess/podcast.list $GOACLA; else sleep 10s; fi; done; fi &
while true; do nginx -e stderr; sleep 1; done &
while [ "$shutdown_requested" = "false" ]; do
  cd /app || exit 1
  node index.js &
  backend_pid=$!
  while kill -0 "$backend_pid" 2>/dev/null; do
      wait "$backend_pid" 2>/dev/null || true
  done
  backend_pid=""
  [ "$shutdown_requested" = "false" ] || break
  sleep 1
done

# The backend owns the database shutdown deadline and has now exited. Stop the
# auxiliary supervisors without leaving descendants behind.
terminate_tree "$$"
wait 2>/dev/null || true
exit 0
