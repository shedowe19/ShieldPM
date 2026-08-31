#!/usr/bin/env sh

if [ "${NC_AIO:-false}" != "true" ] || [ -f /data/aio.lock ]; then
    exit 0
fi

case "${SHIELDPM_AIO_ACCESS_TOKEN:-}" in
    ""|*[!A-Za-z0-9._~-]*)
        echo "Nextcloud AIO auto-configuration is waiting for SHIELDPM_AIO_ACCESS_TOKEN(_FILE)." >&2
        exit 0
        ;;
esac

while [ "$(healthcheck.sh)" != "OK" ]; do sleep 10s; done

payload='{"domain_names":["'"$NC_DOMAIN"'"],"forward_scheme":"http","forward_host":"127.0.0.1","forward_port":11000,"allow_websocket_upgrade":true,"access_list_id":"0","certificate_id":"new","ssl_forced":true,"http2_support":true,"hsts_enabled":true,"hsts_subdomains":true,"meta":{"letsencrypt_email":"","letsencrypt_agree":true,"dns_challenge":false},"advanced_config":"","locations":[{"path":"/","advanced_config":"proxy_set_header Accept-Encoding $http_accept_encoding;","forward_scheme":"http","forward_host":"127.0.0.1","forward_port":11000}],"block_exploits":false,"caching_enabled":false}'

# Feed the short-lived access token through curl's stdin config so it never appears in the process arguments.
if printf 'header = "Authorization: Bearer %s"\n' "$SHIELDPM_AIO_ACCESS_TOKEN" | curl \
    --config - \
    --fail-with-body \
    --silent \
    --show-error \
    --request POST \
    "http://127.0.0.1:$NIBEP/nginx/proxy-hosts" \
    --header 'Content-Type: application/json' \
    --data "$payload" \
    > /dev/null; then
    install -m 0600 /dev/null /data/aio.lock
    echo "The default Nextcloud AIO proxy host was created."
else
    echo "Nextcloud AIO auto-configuration failed; no lock was written and the next restart will retry." >&2
    exit 1
fi
