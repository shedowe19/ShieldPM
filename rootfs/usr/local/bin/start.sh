#!/usr/bin/env sh

if [ "$ACME_KEY_TYPE" = "rsa" ]; then
    sed -i "s|key-type = ecdsa|key-type = rsa|g" /etc/certbot.ini
fi
if [ "$ACME_MUST_STAPLE" = "false" ]; then
    sed -i "s|must-staple = true|must-staple = false|g" /etc/certbot.ini
fi
if [ "$ACME_SERVER_TLS_VERIFY" = "false" ]; then
    sed -i "s|no-verify-ssl = false|no-verify-ssl = true|g" /etc/certbot.ini
fi
if [ "$ACME_PROFILE" != "none" ]; then
    sed -i "s|#required-profile|required-profile = $ACME_PROFILE|g" /etc/certbot.ini
fi


if [ "$PHP82" = "true" ]; then
    apt-get update && apt-get install -y --no-install-recommends php8.2-fpm
    # From https://github.com/nextcloud/all-in-one/pull/1377/files
    if [ -n "$PHP82_APKS" ]; then
        for pkg in $(echo "$PHP82_APKS" | tr " " "\n"); do
            echo "Installing $pkg via apt-get..."
            if ! apt-get install -y --no-install-recommends "$pkg" > /dev/null 2>&1; then
                echo "The package \"$pkg\" was not installed!"
            fi
        done
    fi
    mkdir -vp /data/php
    cp -varnT /etc/php/8.2/fpm /data/php/82
    
    # PHP Init: Debianize php.ini (Comment out extensions managed by conf.d)
    if [ -f /data/php/82/php.ini ]; then
        sed -i 's|^extension=|;extension=|g' /data/php/82/php.ini
        sed -i 's|^zend_extension=|;zend_extension=|g' /data/php/82/php.ini
    fi

    sed -i "s|#\?listen =.*|listen = /run/php82.sock|" /data/php/82/pool.d/www.conf
    sed -i "s|;error_log =.*|error_log = /proc/self/fd/2|g" /data/php/82/php-fpm.conf
    sed -i "s|include=.*|include=/data/php/82/pool.d/*.conf|g" /data/php/82/php-fpm.conf
    sed -i "s|;clear_env = no|clear_env = no|g" /data/php/82/pool.d/www.conf
elif [ "$FULLCLEAN" = "true" ]; then
    rm -vrf /data/php/82
fi

if [ "$PHP83" = "true" ]; then
    apt-get update && apt-get install -y --no-install-recommends php8.3-fpm
    # From https://github.com/nextcloud/all-in-one/pull/1377/files
    if [ -n "$PHP83_APKS" ]; then
        for pkg in $(echo "$PHP83_APKS" | tr " " "\n"); do
            echo "Installing $pkg via apt-get..."
            if ! apt-get install -y --no-install-recommends "$pkg" > /dev/null 2>&1; then
                echo "The package \"$pkg\" was not installed!"
            fi
        done
    fi
    mkdir -vp /data/php
    cp -varnT /etc/php/8.3/fpm /data/php/83

    # PHP Init: Debianize php.ini (Comment out extensions managed by conf.d)
    if [ -f /data/php/83/php.ini ]; then
        sed -i 's|^extension=|;extension=|g' /data/php/83/php.ini
        sed -i 's|^zend_extension=|;zend_extension=|g' /data/php/83/php.ini
    fi

    sed -i "s|#\?listen =.*|listen = /run/php83.sock|" /data/php/83/pool.d/www.conf
    sed -i "s|;error_log =.*|error_log = /proc/self/fd/2|g" /data/php/83/php-fpm.conf
    sed -i "s|include=.*|include=/data/php/83/pool.d/*.conf|g" /data/php/83/php-fpm.conf
    sed -i "s|;clear_env = no|clear_env = no|g" /data/php/83/pool.d/www.conf
elif [ "$FULLCLEAN" = "true" ]; then
    rm -vrf /data/php/83
fi

if [ "$PHP84" = "true" ]; then
    apt-get update && apt-get install -y --no-install-recommends php8.4-fpm
    # From https://github.com/nextcloud/all-in-one/pull/1377/files
    if [ -n "$PHP84_APKS" ]; then
        for pkg in $(echo "$PHP84_APKS" | tr " " "\n"); do
            echo "Installing $pkg via apt-get..."
            if ! apt-get install -y --no-install-recommends "$pkg" > /dev/null 2>&1; then
                echo "The package \"$pkg\" was not installed!"
            fi
        done
    fi
    mkdir -vp /data/php
    cp -varnT /etc/php/8.4/fpm /data/php/84

    # PHP Init: Debianize php.ini (Comment out extensions managed by conf.d)
    if [ -f /data/php/84/php.ini ]; then
        sed -i 's|^extension=|;extension=|g' /data/php/84/php.ini
        sed -i 's|^zend_extension=|;zend_extension=|g' /data/php/84/php.ini
    fi

    sed -i "s|#\?listen =.*|listen = /run/php84.sock|" /data/php/84/pool.d/www.conf
    sed -i "s|;error_log =.*|error_log = /proc/self/fd/2|g" /data/php/84/php-fpm.conf
    sed -i "s|include=.*|include=/data/php/84/pool.d/*.conf|g" /data/php/84/php-fpm.conf
    sed -i "s|;clear_env = no|clear_env = no|g" /data/php/84/pool.d/www.conf
elif [ "$FULLCLEAN" = "true" ]; then
    rm -vrf /data/php/84
fi

if { [ "$PHP82" = "true" ] || [ "$PHP83" = "true" ] || [ "$PHP84" = "true" ]; } && [ -n "$PHP_APKS" ]; then
    # From https://github.com/nextcloud/all-in-one/pull/1377/files
    for pkg in $(echo "$PHP_APKS" | tr " " "\n"); do
        echo "Installing $pkg via apt-get..."
        if ! apt-get install -y --no-install-recommends "$pkg" > /dev/null 2>&1; then
            echo "The package \"$pkg\" was not installed!"
        fi
    done
fi

if [ "$FULLCLEAN" = "true" ] && [ "$PHP82" = "false" ] && [ "$PHP83" = "false" ] && [ "$PHP84" = "false" ]; then
    rm -vrf /data/php
fi


mkdir -p /data/acme-challenge \
         /tmp/npmhome \
         /tmp/goa \
         /data/certbot-log \
         /data/certbot-work \
         /data/certbot-credentials
mkdir -vp /data/tls/certbot/renewal \
          /data/tls/custom \
          /data/shieldpm \
          /data/html \
          /data/access \
          /data/crowdsec \
          /data/modsecurity \
          /data/modsecurity/crs-plugins \
          /data/nginx/redirection_host \
          /data/nginx/proxy_host \
          /data/nginx/dead_host \
          /data/nginx/stream \
          /data/custom_nginx \
          /data/tor


# Tor Hidden Service Setup
if [ "${TOR_ENABLED:-true}" = "true" ]; then
    chmod 700 /data/tor
    
    # Generate Control Port Password if not exists
    if [ ! -s /data/shieldpm/tor-control-password ]; then
        TOR_PASSWORD=$(openssl rand -base64 32)
        echo "$TOR_PASSWORD" > /data/shieldpm/tor-control-password
        chmod 600 /data/shieldpm/tor-control-password
        echo "Generated new Tor control password"
    fi
    
    TOR_PASSWORD=$(cat /data/shieldpm/tor-control-password)
    TOR_HASH=$(tor --hash-password "$TOR_PASSWORD" 2>/dev/null | tail -1)
    if [ -n "$TOR_HASH" ]; then
        cp /etc/tor/torrc.tpl /etc/tor/torrc
        sed -i "s|__TOR_CONTROL_PASSWORD__|$TOR_HASH|g" /etc/tor/torrc
        echo "Tor control password configured"
    else
        echo "Warning: Could not generate Tor password hash (tor binary may not be available)"
    fi
fi


if [ -n "$(ls -A /data/nginx/custom 2> /dev/null)"  ]; then
    cp -van /data/nginx/custom/* /data/nginx_custom
fi
rm -vrf /data/nginx/custom

#tmp
if [ -n "$(ls -A /data/nginx_custom 2> /dev/null)"  ]; then
    cp -van /data/nginx_custom/* /data/custom_nginx
fi
rm -vrf /data/nginx_custom

#tmp
if [ -n "$(ls -A /data/etc 2> /dev/null)" ]; then
    cp -van /data/etc/* /data
    if [ -s /data/crowdsec/crowdsec.conf ]; then
        sed -i "s|/data/etc|/data|g" /data/crowdsec/crowdsec.conf
    fi
fi
rm -vrf /data/etc

#tmp
if [ -n "$(ls -A /data/npm 2> /dev/null)" ]; then
    cp -van /data/npm/* /data/shieldpm
fi
rm -vrf /data/npm

#tmp
if [ -s /data/database.sqlite ]; then
    mv -vn /data/database.sqlite /data/shieldpm/database.sqlite
fi

if [ -s /data/shieldpm/database.sqlite ]; then
    sqlite-vaccum.js
fi


if [ -s /data/keys.json ]; then
    mv -vn /data/keys.json /data/shieldpm/keys.json
fi


if [ -n "$(ls -A /data/nginx/default_www 2> /dev/null)" ]; then
    cp -van /data/nginx/default_www/* /data/html
fi
rm -vrf /data/nginx/default_www

if [ -n "$(ls -A /data/custom_ssl 2> /dev/null)" ]; then
    cp -van /data/custom_ssl/* /data/tls/custom
fi
rm -vrf /data/custom_ssl


if mountpoint -q /etc/letsencrypt; then
    cp -van /etc/letsencrypt/* /data/tls/certbot
    echo "All certbot certs have been copied, please remove the /etc/letsencrypt mountpoint and redeploy to continue the migration!"
    sleep inf
fi

#tmp move to mointpoint if block
find /data/tls/certbot/renewal -type f -name '*.conf' -exec sed -i "s|/etc/letsencrypt|/data/tls/certbot|g" {} \;
find /data/tls/certbot/renewal -type f -name '*.conf' -exec sed -i "s|/data/tls/certbot/credentials|/data/certbot-credentials|g" {} \;

if [ -d /data/tls/certbot/live ] && [ -d /data/tls/certbot/archive ]; then
  find /data/tls/certbot/live ! -name "$(printf "*\n*")" -type f -name "*.pem" > tmp
  while IFS= read -r cert
  do
    rm -vf "$cert"
    ln -s "$(find /data/tls/certbot/archive/"$(echo "$cert" | sed "s|/data/tls/certbot/live/\(npm-[0-9]\+/.*\).pem|\1|g")"*.pem | sort -r | head -n1 | sed "s|/data/tls/certbot/|../../|g")" "$cert"
  done < tmp
  rm tmp
fi

rm -vrf /data/tls/certbot/crs
rm -vrf /data/tls/certbot/keys
if [ -d /data/tls/certbot/live ] && [ -d /data/tls/certbot/archive ]; then
    certs_in_use="$(find /data/tls/certbot/live -type l -name "*.pem" -exec readlink -f {} \;)"
    export certs_in_use
    find /data/tls/certbot/archive ! -name "$(printf "*\n*")" -type f -name "*.pem" > tmp
    while IFS= read -r archive
    do
        if ! echo "$certs_in_use" | grep -q "$archive"; then
          rm -vf "$archive"
        fi
    done < tmp
    rm tmp
fi

# can be used to delete certificates which expired more than 16 weeks ago
#if [ "$FULLCLEAN" = "true" ]; then
#    for cert in $(find /data/tls/certbot/live/npm-* -type d | sed "s|/data/tls/certbot/live/||g"); do
#        if ! openssl x509 -in "/data/tls/certbot/live/$cert/fullchain.pem" -checkend -9676800 >/dev/null; then
#            rm -rvf "/data/tls/certbot/live/$cert"
#            rm -rvf "/data/tls/certbot/live/$cert.der"
#            rm -rvf "/data/tls/certbot/archive/$cert"
#            rm -rvf "/data/tls/certbot/renewal/$cert.conf"
#        fi
#    done
#fi

rm -vrf /data/letsencrypt-acme-challenge \
        /data/nginx/default_host \
        /data/nginx/temp \
        /data/logs

mkdir -p /data/nginx/firewall
touch /data/modsecurity/modsecurity-extra.conf \
      /data/html/index.html \
      /data/nginx/ip_ranges.conf \
      /data/nginx/firewall.conf \
      /data/custom_nginx/events.conf \
      /data/custom_nginx/http.conf \
      /data/custom_nginx/http_top.conf \
      /data/custom_nginx/root_top.conf \
      /data/custom_nginx/root.conf \
      /data/custom_nginx/server_dead.conf \
      /data/custom_nginx/server_proxy.conf \
      /data/custom_nginx/server_redirect.conf \
      /data/custom_nginx/stream.conf \
      /data/custom_nginx/stream_top.conf \
      /data/custom_nginx/server_stream.conf \
      /data/custom_nginx/server_stream_tcp.conf \
      /data/custom_nginx/server_stream_udp.conf


if [ ! -s /data/modsecurity/modsecurity-default.conf ]; then
      cp -van /usr/local/nginx/conf/conf.d/include/modsecurity.conf.example /data/modsecurity/modsecurity-default.conf
fi
cp -a /usr/local/nginx/conf/conf.d/include/modsecurity.conf.example /data/modsecurity/modsecurity-default.conf.example
if [ -s /data/modsecurity/modsecurity-default.conf ]; then
    sed -i "s|SecUnicodeMapFile unicode.mapping|SecUnicodeMapFile /usr/local/nginx/conf/conf.d/include/unicode.mapping|g" /data/modsecurity/modsecurity-default.conf
fi

if [ ! -s /data/modsecurity/crs-setup.conf ]; then
      cp -van /usr/local/nginx/conf/conf.d/include/coreruleset/crs-setup.conf.example /data/modsecurity/crs-setup.conf
fi
cp -a /usr/local/nginx/conf/conf.d/include/coreruleset/crs-setup.conf.example /data/modsecurity/crs-setup.conf.example

if [ ! -s /data/modsecurity/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example ]; then
      cp -van /usr/local/nginx/conf/conf.d/include/coreruleset/rules/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example /data/modsecurity/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf
fi
cp -a /usr/local/nginx/conf/conf.d/include/coreruleset/rules/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example /data/modsecurity/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example

if [ ! -s /data/modsecurity/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf.example ]; then
      cp -van /usr/local/nginx/conf/conf.d/include/coreruleset/rules/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf.example /data/modsecurity/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf
fi
cp -a /usr/local/nginx/conf/conf.d/include/coreruleset/rules/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf.example /data/modsecurity/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf.example

cp -a /usr/local/nginx/conf/conf.d/include/coreruleset/plugins/* /data/modsecurity/crs-plugins


if [ ! -s /data/crowdsec/ban.html ]; then
    cp -van /usr/local/nginx/conf/conf.d/include/ban.html /data/crowdsec/ban.html
fi
cp -a /usr/local/nginx/conf/conf.d/include/ban.html /data/crowdsec/ban.html.example

if [ ! -s /data/crowdsec/captcha.html ]; then
    cp -van /usr/local/nginx/conf/conf.d/include/captcha.html /data/crowdsec/captcha.html
fi
cp -a /usr/local/nginx/conf/conf.d/include/captcha.html /data/crowdsec/captcha.html.example

if [ ! -s /data/crowdsec/crowdsec.conf ]; then
    cp -van /usr/local/nginx/conf/conf.d/include/crowdsec.conf /data/crowdsec/crowdsec.conf
fi
cp -a /usr/local/nginx/conf/conf.d/include/crowdsec.conf /data/crowdsec/crowdsec.conf.example

if ! grep -q "^REQUEST_TIMEOUT=" /data/crowdsec/crowdsec.conf; then
    echo "REQUEST_TIMEOUT=5000" >> /data/crowdsec/crowdsec.conf
fi
if ! grep -q "^FALLBACK_REMEDIATION=" /data/crowdsec/crowdsec.conf; then
    echo "FALLBACK_REMEDIATION=ban" >> /data/crowdsec/crowdsec.conf
fi
if ! grep -q "^BOUNCING_ON_TYPE=" /data/crowdsec/crowdsec.conf; then
    echo "BOUNCING_ON_TYPE=all" >> /data/crowdsec/crowdsec.conf
fi
if ! grep -q "^CAPTCHA_PROVIDER=" /data/crowdsec/crowdsec.conf; then
    echo "CAPTCHA_PROVIDER=recaptcha" >> /data/crowdsec/crowdsec.conf
fi


if grep -iq "^ENABLED *= *true$" /data/crowdsec/crowdsec.conf; then
    if [ ! -s /usr/local/nginx/conf/conf.d/crowdsec.conf ]; then
        cp -van /usr/local/nginx/conf/conf.d/include/crowdsec_nginx.conf /usr/local/nginx/conf/conf.d/crowdsec.conf
    fi
else
    rm -vf /usr/local/nginx/conf/conf.d/crowdsec.conf
fi


if [ "$DEFAULT_CERT_ID" = "0" ]; then
    export DEFAULT_CERT=/data/tls/dummycert.pem
    export DEFAULT_KEY=/data/tls/dummykey.pem
    echo "no DEFAULT_CERT_ID set, using dummycerts."
else
    if [ -d "/data/tls/certbot/live/npm-$DEFAULT_CERT_ID" ]; then
        if [ ! -s /data/tls/certbot/live/npm-"$DEFAULT_CERT_ID"/fullchain.pem ]; then
            echo "/data/tls/certbot/live/npm-$DEFAULT_CERT_ID/fullchain.pem does not exist"
            export DEFAULT_CERT=/data/tls/dummycert.pem
            export DEFAULT_KEY=/data/tls/dummykey.pem
            echo "using dummycerts."
        else
            export DEFAULT_CERT=/data/tls/certbot/live/npm-"$DEFAULT_CERT_ID"/fullchain.pem
            echo "DEFAULT_CERT set to /data/tls/certbot/live/npm-$DEFAULT_CERT_ID/fullchain.pem"
            if [ ! -s /data/tls/certbot/live/npm-"$DEFAULT_CERT_ID"/privkey.pem ]; then
                echo "/data/tls/certbot/live/npm-$DEFAULT_CERT_ID/privkey.pem does not exist"
                export DEFAULT_CERT=/data/tls/dummycert.pem
                export DEFAULT_KEY=/data/tls/dummykey.pem
                echo "using dummycerts."
            else
                export DEFAULT_KEY=/data/tls/certbot/live/npm-"$DEFAULT_CERT_ID"/privkey.pem
                echo "DEFAULT_KEY set to /data/tls/certbot/live/npm-$DEFAULT_CERT_ID/privkey.pem"
                if [ -s /data/tls/certbot/live/npm-"$DEFAULT_CERT_ID".der ] && [ "$ACME_OCSP_STAPLING" = "true" ]; then
                     export DEFAULT_STAPLING_FILE=/data/tls/certbot/live/npm-"$DEFAULT_CERT_ID".der
                     echo "DEFAULT_STAPLING_FILE set to /data/tls/certbot/live/npm-$DEFAULT_CERT_ID.der"
                fi
            fi
        fi
    elif [ -d "/data/tls/custom/npm-$DEFAULT_CERT_ID" ]; then
        if [ ! -s /data/tls/custom/npm-"$DEFAULT_CERT_ID"/fullchain.pem ]; then
            echo "/data/tls/custom/npm-$DEFAULT_CERT_ID/fullchain.pem does not exist"
            export DEFAULT_CERT=/data/tls/dummycert.pem
            export DEFAULT_KEY=/data/tls/dummykey.pem
            echo "using dummycerts."
        else
            export DEFAULT_CERT=/data/tls/custom/npm-"$DEFAULT_CERT_ID"/fullchain.pem
            echo "DEFAULT_CERT set to /data/tls/custom/npm-$DEFAULT_CERT_ID/fullchain.pem"
            if [ ! -s /data/tls/custom/npm-"$DEFAULT_CERT_ID"/privkey.pem ]; then
                echo "/data/tls/custom/npm-$DEFAULT_CERT_ID/privkey.pem does not exist"
                export DEFAULT_CERT=/data/tls/dummycert.pem
                export DEFAULT_KEY=/data/tls/dummykey.pem
                echo "using dummycerts."
            else
                export DEFAULT_KEY=/data/tls/custom/npm-"$DEFAULT_CERT_ID"/privkey.pem
                echo "DEFAULT_KEY set to /data/tls/custom/npm-$DEFAULT_CERT_ID/privkey.pem"
                if [ -s /data/tls/custom/npm-"$DEFAULT_CERT_ID".der ] && [ "$CUSTOM_OCSP_STAPLING" = "true" ]; then
                     export DEFAULT_STAPLING_FILE=/data/tls/custom/npm-"$DEFAULT_CERT_ID".der
                     echo "DEFAULT_STAPLING_FILE set to /data/tls/custom/npm-$DEFAULT_CERT_ID.der"
                fi
            fi
        fi
    else
        export DEFAULT_CERT=/data/tls/dummycert.pem
        export DEFAULT_KEY=/data/tls/dummykey.pem
        echo "cert with ID $DEFAULT_CERT_ID does not exist, using dummycerts."
    fi
fi

if { [ "$DEFAULT_CERT" = "/data/tls/dummycert.pem" ] && [ "$DEFAULT_KEY" != "/data/tls/dummykey.pem" ]; } || { [ "$DEFAULT_CERT" != "/data/tls/dummycert.pem" ] && [ "$DEFAULT_KEY" = "/data/tls/dummykey.pem" ]; }; then
    export DEFAULT_CERT=/data/tls/dummycert.pem
    export DEFAULT_KEY=/data/tls/dummykey.pem
    echo "something went wrong, using dummycerts."
fi

if [ "$DEFAULT_CERT" = "/data/tls/dummycert.pem" ] || [ "$DEFAULT_KEY" = "/data/tls/dummykey.pem" ]; then
    if [ ! -s /data/tls/dummycert.pem ] || [ ! -s /data/tls/dummykey.pem ]; then
        rm -vrf /data/tls/dummycert.pem /data/tls/dummykey.pem
        openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:secp384r1 -days 365000 -nodes -x509 -subj '/CN=*' -sha512 -keyout /data/tls/dummykey.pem -out /data/tls/dummycert.pem
    fi
    unset DEFAULT_STAPLING_FILE
else
    rm -vrf /data/tls/dummycert.pem /data/tls/dummykey.pem
fi

sed -i "s|ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /app/templates/default.conf
sed -i "s|ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /app/templates/default.conf
if [ -s "$DEFAULT_STAPLING_FILE" ]; then
    sed -i "s|#\?ssl_stapling|ssl_stapling|g" /app/templates/default.conf
    sed -i "s|#\?ssl_stapling_file .*|ssl_stapling_file $DEFAULT_STAPLING_FILE;|g" /app/templates/default.conf
fi

sed -i "s|ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /usr/local/nginx/conf/conf.d/shieldpm.conf
sed -i "s|ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /usr/local/nginx/conf/conf.d/shieldpm.conf
# The admin UI is served directly by Nginx, so it cannot rely on the backend's
# Helmet middleware for browser security headers. Inject this server-scoped
# include idempotently after the admin server name.
if ! grep -Fq "include conf.d/include/shieldpm-admin-security.conf;" /usr/local/nginx/conf/conf.d/shieldpm.conf; then
    sed -i '/^[[:space:]]*server_name _;[[:space:]]*$/a\    include conf.d/include/shieldpm-admin-security.conf;' /usr/local/nginx/conf/conf.d/shieldpm.conf
fi
if [ -s "$DEFAULT_STAPLING_FILE" ]; then
    sed -i "s|#\?ssl_stapling|ssl_stapling|g" /usr/local/nginx/conf/conf.d/shieldpm.conf
    sed -i "s|#\?ssl_stapling_file .*|ssl_stapling_file $DEFAULT_STAPLING_FILE;|g" /usr/local/nginx/conf/conf.d/shieldpm.conf
fi

sed -i "s|ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
sed -i "s|ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
if [ -s "$DEFAULT_STAPLING_FILE" ]; then
    sed -i "s|#\?ssl_stapling|ssl_stapling|g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
    sed -i "s|#\?ssl_stapling_file .*|ssl_stapling_file $DEFAULT_STAPLING_FILE;|g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
fi

sed -i "s|#\?listen 0.0.0.0:81 |listen $NPM_IPV4_BINDING:$NPM_PORT |g" /usr/local/nginx/conf/conf.d/shieldpm.conf
sed -i "s|#\?listen 0.0.0.0:91 |listen $GOA_IPV4_BINDING:$GOA_PORT |g" /usr/local/nginx/conf/conf.d/include/goaccess.conf

if [ "$DISABLE_IPV6" = "true" ]; then
    sed -i "s|ipv6=on;|ipv6=off;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|#\?listen \[::\]:81 |#listen $NPM_IPV6_BINDING:$NPM_PORT |g" /usr/local/nginx/conf/conf.d/shieldpm.conf
    sed -i "s|#\?listen \[::\]:91 |#listen $GOA_IPV6_BINDING:$GOA_PORT |g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
else
    sed -i "s|#\?listen \[::\]:81 |listen $NPM_IPV6_BINDING:$NPM_PORT |g" /usr/local/nginx/conf/conf.d/shieldpm.conf
    sed -i "s|#\?listen \[::\]:91 |listen $GOA_IPV6_BINDING:$GOA_PORT |g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
fi

if [ "$GOA" = "true" ]; then
    mkdir -vp /data/goaccess/data /data/goaccess/geoip
    cp -van /usr/local/nginx/conf/conf.d/include/goaccess.conf /usr/local/nginx/conf/conf.d/goaccess.conf
elif [ "$FULLCLEAN" = "true" ]; then
    rm -vrf /data/goaccess
fi

if [ "$LISTEN_PROXY_PROTOCOL" = "true" ]; then
  sed -i "s|real_ip_header.*|real_ip_header proxy_protocol;|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_QUIC_BPF" = "true" ]; then
  sed -i "s|quic_bpf.*|quic_bpf on;|g" /usr/local/nginx/conf/nginx.conf
else
  sed -i "s|quic_bpf.*|quic_bpf off;|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_LOG_NOT_FOUND" = "true" ]; then
    sed -i "s|log_not_found.*|log_not_found on;|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_404_REDIRECT" = "true" ]; then
    sed -i "s|#error_page 404|error_page 404|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_DISABLE_PROXY_BUFFERING" = "true" ]; then
    sed -i "s|proxy_buffering.*|proxy_buffering off;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|proxy_request_buffering.*|proxy_request_buffering off;|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_WORKER_PROCESSES" != "auto" ]; then
    sed -i "s|worker_processes.*|worker_processes $NGINX_WORKER_PROCESSES;|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_WORKER_CONNECTIONS" != "512" ]; then
    sed -i "s|worker_connections.*|worker_connections $NGINX_WORKER_CONNECTIONS;|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_HSTS_SUBDOMAINS" = "false" ]; then
    sed -i "s|includeSubDomains; ||g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$X_FRAME_OPTIONS" = "deny" ]; then
    sed -i "s|SAMEORIGIN|DENY|g" /app/templates/_hsts.conf
fi
if [ "$X_FRAME_OPTIONS" = "none" ]; then
    sed -i "s|#\?\(.*SAMEORIGIN\)|#\1|g" /app/templates/_hsts.conf
fi

if [ "$NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE" = "true" ]; then
    sed -i "s|#\(load_module.\+libngx_module.so;\)|\1|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|brotli on;|brotli off;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|unbrotli on;|unbrotli off;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|brotli_static on;|brotli_static off;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|zstd on;|zstd off;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|zstd_static on;|zstd_static off;|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_LOAD_GEOIP2_MODULE" = "true" ]; then

    sed -i "s|#\s*\(load_module.\+geoip2_module.so;\)|\1|g" /usr/local/nginx/conf/nginx.conf

    sed -i "s|#\s*\(geoip2 /data/nginx/GeoLite2-Country.mmdb {\)|\1|g" /usr/local/nginx/conf/nginx.conf

    sed -i "s|#\s*\(auto_reload 5m;\)|\1|g" /usr/local/nginx/conf/nginx.conf

    sed -i "s|#\s*,'\"geoip_country_code\": \"\$geoip2_country_code\"'|,\"geoip_country_code\": \"\$geoip2_country_code\"|g" /usr/local/nginx/conf/nginx.conf

    sed -i "s|#\s*\(}\)|\1|g" /usr/local/nginx/conf/nginx.conf

    sed -i "s|#\s*\(geoip2 /data/nginx/GeoLite2-City.mmdb {\)|\1|g" /usr/local/nginx/conf/nginx.conf

    sed -i "s|#\s*\(.*\$geoip2_city_name default=Unknown source=\$remote_addr city names en;\)|\1|g" /usr/local/nginx/conf/nginx.conf

    sed -i "s|#\s*\(\$geoip2_country_code.\+country iso_code;\)|\1|g" /usr/local/nginx/conf/nginx.conf
fi
# The application writes global geo/map directives here for host firewall policies.
# Keep this in the http context, before generated vhost configs.
if ! grep -qF "include /data/nginx/firewall.conf;" /usr/local/nginx/conf/nginx.conf; then
    sed -i '/include \/data\/nginx\/ip_ranges.conf;/a\    include /data/nginx/firewall.conf;' /usr/local/nginx/conf/nginx.conf
fi
# Run host-firewall Lua checks before regular Nginx access/auth handlers.
if ! grep -qF "access_by_lua_no_postpone on;" /usr/local/nginx/conf/nginx.conf; then
    sed -i '/include \/data\/nginx\/firewall.conf;/a\    access_by_lua_no_postpone on;' /usr/local/nginx/conf/nginx.conf
fi

if [ "$NGINX_LOAD_NJS_MODULE" = "true" ]; then
    sed -i "s|#\(load_module.\+js_module.so;\)|\1|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_LOAD_NTLM_MODULE" = "true" ]; then
    sed -i "s|#\(load_module.\+ngx_http_upstream_ntlm_module.so;\)|\1|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_LOAD_VHOST_TRAFFIC_STATUS_MODULE" = "true" ]; then
    sed -i "s|#\(load_module.\+ngx_http_vhost_traffic_status_module.so;\)|\1|g" /usr/local/nginx/conf/nginx.conf
fi

if [ "$REGENERATE_ALL" = "true" ]; then
    find /data/nginx -name "*.conf" -delete
    mkdir -p /data/nginx/firewall
    touch /data/nginx/ip_ranges.conf /data/nginx/firewall.conf
fi

if [ "$LOGROTATE" = "true" ]; then
    sed -i "s|rotate [0-9]\+|rotate $LOGROTATIONS|g" /etc/logrotate
    sed -i "s|access_log off; # http|access_log /data/nginx/access.log alog;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|access_log off; # stream|access_log /data/nginx/stream.log slog;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|#error_log|error_log|g" /usr/local/nginx/conf/nginx.conf
    touch /data/nginx/access.log \
          /data/nginx/json_access.log \
          /data/nginx/stream.log \
          /data/nginx/error.log
elif [ "$FULLCLEAN" = "true" ]; then
    rm -vrf /data/logrotate.status \
            /data/nginx/access.log \
            /data/nginx/access.log.* \
            /data/nginx/error.log \
            /data/nginx/error.log.* \
            /data/nginx/stream.log \
            /data/nginx/stream.log.*
fi

find /data/tls \
     /data/access \
     /data/shieldpm \
     -not -perm 770 \
     -exec chmod 770 {} \;

rm -vf /usr/local/nginx/logs/nginx.pid
rm -vf /run/*.sock

if [ "$PUID" != "0" ]; then
    if id -u npm > /dev/null 2>&1; then
        usermod -u "$PUID" npm
    else
        useradd -o -u "$PUID" -U -d /tmp/npmhome -s /sbin/nologin npm
    fi
    if [ -z "$(getent group npm | cut -d: -f3)" ]; then
        groupadd -f -g "$PGID" npm
    else
        groupmod -o -g "$PGID" npm
    fi
    groupmod -o -g "$PGID" npm
    if [ "$(getent group npm | cut -d: -f3)" != "$PGID" ]; then
        echo "ERROR: Unable to set group id properly"
        sleep inf
    fi
    usermod -G "$PGID" npm
    if [ "$(id -g npm)" != "$PGID" ] ; then
        echo "ERROR: Unable to set group against the user properly"
        sleep inf
    fi
    find /usr/local \
         /data \
         /run \
         /tmp \
         -not \( -uid "$PUID" -and -gid "$PGID" \) \
         -exec chown "$PUID:$PGID" {} \;
    chown "$PUID:$PGID" /proc/self/fd/2
    if [ "$PHP82" = "true" ]; then
        sed -i "s|;\?user =.*|;user = root|" /data/php/82/pool.d/www.conf
        sed -i "s|;\?group =.*|;group = root|" /data/php/82/pool.d/www.conf
    fi
    if [ "$PHP83" = "true" ]; then
        sed -i "s|;\?user =.*|;user = root|" /data/php/83/pool.d/www.conf
        sed -i "s|;\?group =.*|;group = root|" /data/php/83/pool.d/www.conf
    fi
    if [ "$PHP84" = "true" ]; then
        sed -i "s|;\?user =.*|;user = root|" /data/php/84/pool.d/www.conf
        sed -i "s|;\?group =.*|;group = root|" /data/php/84/pool.d/www.conf
    fi
    sed -i "s|user root;|#user root;|g" /usr/local/nginx/conf/nginx.conf
    exec gosu "$PUID:$PGID" launch.sh
else
    find /data -not \( -uid 0 -and -gid 0 \) -exec chown 0:0 {} \;
    if [ "$PHP82" = "true" ]; then
        sed -i "s|;user =.*|user = root|" /data/php/82/pool.d/www.conf
        sed -i "s|;group =.*|group = root|" /data/php/82/pool.d/www.conf
    fi
    if [ "$PHP83" = "true" ]; then
        sed -i "s|;user =.*|user = root|" /data/php/83/pool.d/www.conf
        sed -i "s|;group =.*|group = root|" /data/php/83/pool.d/www.conf
    fi
    if [ "$PHP84" = "true" ]; then
        sed -i "s|;user =.*|user = root|" /data/php/84/pool.d/www.conf
        sed -i "s|;group =.*|group = root|" /data/php/84/pool.d/www.conf
    fi
    sed -i "s|#user root;|user root;|g"  /usr/local/nginx/conf/nginx.conf
    exec launch.sh
fi
