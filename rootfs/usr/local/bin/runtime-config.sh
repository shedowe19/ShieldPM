#!/usr/bin/env sh

# These files survive native service and Docker container restarts. Always
# replace the current value, rather than matching only the shipped default.
configure_certbot_ini() {
    certbot_ini=$1
    certbot_no_verify=false
    [ "$ACME_SERVER_TLS_VERIFY" = false ] && certbot_no_verify=true
    certbot_profile="#required-profile"
    [ "$ACME_PROFILE" = none ] || certbot_profile="required-profile = $ACME_PROFILE"
    sed -i -E \
        -e "s|^key-type[[:space:]]*=.*|key-type = $ACME_KEY_TYPE|" \
        -e "s|^must-staple[[:space:]]*=.*|must-staple = $ACME_MUST_STAPLE|" \
        -e "s|^no-verify-ssl[[:space:]]*=.*|no-verify-ssl = $certbot_no_verify|" \
        -e "s|^#?required-profile([[:space:]]*=.*)?$|$certbot_profile|" "$certbot_ini"
}

configure_ui_listeners() {
    listener_file=$1
    listener_ipv4=$2
    listener_ipv6=$3
    listener_port=$4
    listener_ipv6_prefix=""
    [ "$DISABLE_IPV6" = true ] && listener_ipv6_prefix="#"
    sed -i -E \
        -e "s|^([[:space:]]*)#?[[:space:]]*listen[[:space:]]+[0-9.]+:[0-9]+([[:space:];])|\1listen $listener_ipv4:$listener_port\2|" \
        -e "s|^([[:space:]]*)#?[[:space:]]*listen[[:space:]]+\[[^]]+\]:[0-9]+([[:space:];])|\1${listener_ipv6_prefix}listen $listener_ipv6:$listener_port\2|" "$listener_file"
}

configure_nginx_toggles() {
    nginx_config=$1
    nginx_log_setting=off
    [ "$NGINX_LOG_NOT_FOUND" = true ] && nginx_log_setting=on
    nginx_error_page_prefix="#"
    [ "$NGINX_404_REDIRECT" = true ] && nginx_error_page_prefix=""
    nginx_proxy_buffering=on
    [ "$NGINX_DISABLE_PROXY_BUFFERING" = true ] && nginx_proxy_buffering=off
    sed -i -E \
        -e "s|^([[:space:]]*)log_not_found[[:space:]]+[^;]*;|\1log_not_found $nginx_log_setting;|" \
        -e "s|^([[:space:]]*)#?[[:space:]]*error_page[[:space:]]+404([[:space:]])|\1${nginx_error_page_prefix}error_page 404\2|" \
        -e "s|^([[:space:]]*)proxy_buffering[[:space:]]+[^;]*;|\1proxy_buffering $nginx_proxy_buffering;|" \
        -e "s|^([[:space:]]*)proxy_request_buffering[[:space:]]+[^;]*;|\1proxy_request_buffering $nginx_proxy_buffering;|" \
        -e "s|^([[:space:]]*)worker_processes[[:space:]]+[^;]*;|\1worker_processes $NGINX_WORKER_PROCESSES;|" \
        -e "s|^([[:space:]]*)worker_connections[[:space:]]+[^;]*;|\1worker_connections $NGINX_WORKER_CONNECTIONS;|" "$nginx_config"
}

select_default_certificate() {
    default_tls_root=$1
    default_certificate_id=$2
    DEFAULT_CERT="$default_tls_root/dummycert.pem"
    DEFAULT_KEY="$default_tls_root/dummykey.pem"
    unset DEFAULT_STAPLING_FILE
    if [ "$default_certificate_id" != 0 ]; then
        for default_certificate_type in certbot/live custom internal; do
            default_certificate_dir="$default_tls_root/$default_certificate_type/npm-$default_certificate_id"
            if [ -s "$default_certificate_dir/fullchain.pem" ] && [ -s "$default_certificate_dir/privkey.pem" ]; then
                DEFAULT_CERT="$default_certificate_dir/fullchain.pem"
                DEFAULT_KEY="$default_certificate_dir/privkey.pem"
                if { [ "$default_certificate_type" = certbot/live ] && [ "$ACME_OCSP_STAPLING" = true ]; } || \
                   { [ "$default_certificate_type" = custom ] && [ "$CUSTOM_OCSP_STAPLING" = true ]; }; then
                    if [ -s "$default_certificate_dir.der" ]; then
                        export DEFAULT_STAPLING_FILE="$default_certificate_dir.der"
                    fi
                fi
                break
            fi
        done
    fi
    export DEFAULT_CERT DEFAULT_KEY
}

configure_certificate_stapling() {
    stapling_config=$1
    if [ -n "${DEFAULT_STAPLING_FILE:-}" ] && [ -s "$DEFAULT_STAPLING_FILE" ]; then
        sed -i -E \
            -e 's|^([[:space:]]*)#?[[:space:]]*(ssl_stapling)|\1\2|' \
            -e "s|ssl_stapling_file[[:space:]]+[^;]*;|ssl_stapling_file $DEFAULT_STAPLING_FILE;|" "$stapling_config"
    else
        sed -i -E 's|^([[:space:]]*)#?[[:space:]]*(ssl_stapling)|\1#\2|' "$stapling_config"
    fi
}
