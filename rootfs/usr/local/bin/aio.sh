#!/usr/bin/env sh
set -eu

if [ "${NC_AIO:-false}" != "true" ] || [ -f /data/aio.lock ]; then
    exit 0
fi

while ! healthcheck.sh >/dev/null 2>&1; do sleep 10; done
aio_tmp=$(mktemp -d)
trap 'rm -rf "$aio_tmp"' EXIT
trap 'exit 1' HUP INT TERM

jq -n --arg identity "$INITIAL_ADMIN_EMAIL" --arg secret "$INITIAL_ADMIN_PASSWORD" \
    '{identity: $identity, secret: $secret}' > "$aio_tmp/login.json"
curl --fail --silent --show-error --max-time 30 --unix-socket /run/shieldpm.sock \
    -c "$aio_tmp/cookies" -H 'Content-Type: application/json' \
    --data-binary "@$aio_tmp/login.json" http://localhost/tokens > "$aio_tmp/login-response.json"
if jq -e '.requires_2fa == true' "$aio_tmp/login-response.json" >/dev/null; then
    echo "AIO setup requires an interactive login because the administrator uses two-factor authentication." >&2
    exit 1
fi
aio_token=$(jq -er '.token | select(type == "string" and length > 0)' "$aio_tmp/login-response.json")

# Fetch a CSRF token bound to the authenticated session, retaining both cookies.
aio_csrf=$(curl --fail --silent --show-error --max-time 30 --unix-socket /run/shieldpm.sock \
    -b "$aio_tmp/cookies" -c "$aio_tmp/cookies" -H "Authorization: Bearer $aio_token" \
    http://localhost/ | jq -er '.csrfToken | select(type == "string" and length > 0)')

jq -n --arg domain "$NC_DOMAIN" '{
    domain_names: [$domain], forward_scheme: "http", forward_host: "127.0.0.1", forward_port: 11000,
    allow_websocket_upgrade: true, access_list_id: 0, certificate_id: "new", ssl_forced: true,
    http2_support: true, hsts_enabled: true, hsts_subdomains: true,
    meta: {letsencrypt_email: "", letsencrypt_agree: true, dns_challenge: false},
    advanced_config: "", block_exploits: false, caching_enabled: false,
    locations: [{path: "/", advanced_config: "proxy_set_header Accept-Encoding $http_accept_encoding;",
        forward_scheme: "http", forward_host: "127.0.0.1", forward_port: 11000}]
}' > "$aio_tmp/proxy-host.json"

if curl --fail --silent --show-error --max-time 300 --unix-socket /run/shieldpm.sock \
    -b "$aio_tmp/cookies" -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $aio_token" -H "X-XSRF-TOKEN: $aio_csrf" \
    --data-binary "@$aio_tmp/proxy-host.json" http://localhost/nginx/proxy-hosts > /dev/null; then
    touch /data/aio.lock
    echo "The default AIO proxy host and TLS certificate have been created."
else
    echo "AIO setup failed. Check the certificate and proxy host in the ShieldPM UI before retrying."
    exit 1
fi
