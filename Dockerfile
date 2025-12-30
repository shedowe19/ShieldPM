# syntax=docker/dockerfile:labs

# ==========================================
# Stage 1: Build Nginx with Modules & Patches
# ==========================================
FROM alpine:3.23.2 AS nginx
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]

# --- Build Arguments: Versions ---
ARG NGINX_VER=release-1.29.4
ARG DTR_VER=1.29.2
ARG RCP_VER=1.29.4

# ModSecurity Versions
ARG MODSEC_VER=v3.0.14
ARG MODSECNGX_VER=v1.0.4

# Modules
ARG NB_VER=master
ARG NUB_VER=main
ARG ZNM_VER=master
ARG NF_VER=master
ARG HMNM_VER=v0.39
ARG NDK_VER=v0.3.4
ARG LNM_VER=v0.10.29R2
ARG NAL_VER=master
ARG VTS_VER=v0.2.5
ARG NNTLM_VER=master
ARG NHG2M_VER=3.4

# Lua Libraries
ARG LUAJIT_INC=/usr/include/luajit-2.1
ARG LUAJIT_LIB=/usr/lib
ARG LRC_VER=v0.1.32
ARG LRL_VER=v0.15
ARG LRLT_VER=v0.09


# --- Build Arguments: Compiler Flags ---
ARG FLAGS
ARG CC=clang
ARG CFLAGS="$FLAGS -m64 -O3 -pipe -flto=thin -fstack-clash-protection -fstack-protector-strong -ftrivial-auto-var-init=zero -fno-delete-null-pointer-checks -fno-strict-overflow -fno-strict-aliasing -fno-plt -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=3 -Wformat=2 -Werror=format-security -Wno-sign-compare"
ARG CXX=clang++
ARG CXXFLAGS="$FLAGS -m64 -O3 -pipe -flto=thin -fstack-clash-protection -fstack-protector-strong -ftrivial-auto-var-init=zero -fno-delete-null-pointer-checks -fno-strict-overflow -fno-strict-aliasing -fno-plt -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=3 -D_GLIBCXX_ASSERTIONS -D_LIBCPP_ENABLE_THREAD_SAFETY_ANNOTATIONS=1 -D_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_FAST -Wformat=2 -Werror=format-security -Wno-sign-compare"
ARG LDFLAGS="-fuse-ld=lld -m64 -Wl,-s -Wl,-O1 -Wl,-z,noexecstack -Wl,-z,relro -Wl,-z,now -Wl,--sort-common -Wl,--as-needed -Wl,-z,pack-relative-relocs"

WORKDIR /src

# --- Preparation: Copy Patches ---
COPY nginx-quic/ngx_brotli.patch /src/ngx_brotli.patch
COPY nginx-quic/ngx_unbrotli.patch /src/ngx_unbrotli.patch
COPY nginx-quic/zstd-nginx-module.patch /src/zstd-nginx-module.patch
COPY nginx-quic/attachment.patch /src/attachment.patch

# --- Preparation: Install Dependencies ---
RUN apk upgrade --no-cache -a && \
    apk add --no-cache ca-certificates build-base clang lld cmake ninja git \
                       linux-headers libatomic_ops-dev luajit-dev pcre2-dev zlib-dev brotli-dev zstd-dev openssl-dev geoip-dev libmaxminddb-dev openldap-dev \
                       autoconf automake libtool lmdb-dev libxml2-dev yajl-dev curl-dev

# --- Build Step 1: ModSecurity ---
RUN git clone --depth 1 --shallow-submodules --recurse-submodules https://github.com/owasp-modsecurity/ModSecurity --branch "$MODSEC_VER" /src/ModSecurity && \
    cd /src/ModSecurity && \
    sed -i "s|SecRuleEngine .*|SecRuleEngine On|g" /src/ModSecurity/modsecurity.conf-recommended && \
    sed -i "s|^SecAudit|#SecAudit|g" /src/ModSecurity/modsecurity.conf-recommended && \
    sed -i "s|unicode.mapping|/usr/local/nginx/conf/conf.d/include/unicode.mapping|g" /src/ModSecurity/modsecurity.conf-recommended && \
    sed -i "1i #include <stdint.h>" headers/modsecurity/collection/collection.h && \
    /src/ModSecurity/build.sh && \
    /src/ModSecurity/configure --with-pcre2 --with-lmdb && \
    make -j "$(nproc)" install

# --- Build Step 2: Clone & Patch Nginx ---
RUN git clone --depth 1 https://github.com/nginx/nginx --branch "$NGINX_VER" /src/nginx && \
    cd /src/nginx && \
    wget -q https://raw.githubusercontent.com/nginx-modules/ngx_http_tls_dyn_size/refs/heads/master/nginx__dynamic_tls_records_"$DTR_VER"%2B.patch -O /src/nginx/1.patch && \
    git apply /src/nginx/1.patch && \
    wget -q https://raw.githubusercontent.com/openresty/openresty/refs/heads/master/patches/nginx/"$RCP_VER"/nginx-"$RCP_VER"-resolver_conf_parsing.patch -O /src/nginx/2.patch && \
    git apply /src/nginx/2.patch && \
    wget -q https://patch-diff.githubusercontent.com/raw/nginx/nginx/pull/689.patch -O /src/nginx/3.patch && \
    git apply /src/nginx/3.patch && \
    sed -i "s|nginx/|NPMplus/|g" /src/nginx/src/core/nginx.h && \
    sed -i "s|Server: nginx|Server: NPMplus|g" /src/nginx/src/http/ngx_http_header_filter_module.c && \
    sed -i "/<hr><center>/d" /src/nginx/src/http/ngx_http_special_response.c && \
    \
    git clone --depth 1 https://github.com/google/ngx_brotli --branch "$NB_VER" /src/ngx_brotli && \
    cd /src/ngx_brotli && \
    git apply /src/ngx_brotli.patch && \
    git clone --depth 1 https://github.com/clyfish/ngx_unbrotli --branch "$NUB_VER" /src/ngx_unbrotli && \
    cd /src/ngx_unbrotli && \
    git apply /src/ngx_unbrotli.patch && \
    git clone --depth 1 https://github.com/tokers/zstd-nginx-module --branch "$ZNM_VER" /src/zstd-nginx-module && \
    cd /src/zstd-nginx-module && \
    wget -q https://patch-diff.githubusercontent.com/raw/tokers/zstd-nginx-module/pull/44.patch -O /src/zstd-nginx-module/1.patch && \
    git apply /src/zstd-nginx-module.patch && \
    git apply /src/zstd-nginx-module/1.patch && \
    git clone --depth 1 https://github.com/Zoey2936/ngx-fancyindex --branch "$NF_VER" /src/ngx-fancyindex && \
    git clone --depth 1 https://github.com/openresty/headers-more-nginx-module --branch "$HMNM_VER" /src/headers-more-nginx-module && \
    git clone --depth 1 https://github.com/vision5/ngx_devel_kit --branch "$NDK_VER" /src/ngx_devel_kit && \
    git clone --depth 1 https://github.com/openresty/lua-nginx-module --branch "$LNM_VER" /src/lua-nginx-module && \
    \
    git clone --depth 1 https://github.com/kvspb/nginx-auth-ldap --branch "$NAL_VER" /src/nginx-auth-ldap && \
    git clone --depth 1 https://github.com/vozlt/nginx-module-vts --branch "$VTS_VER" /src/nginx-module-vts && \
    git clone --depth 1 https://github.com/gabihodoroaga/nginx-ntlm-module --branch "$NNTLM_VER" /src/nginx-ntlm-module && \
    git clone --depth 1 https://github.com/SpiderLabs/ModSecurity-nginx --branch "$MODSECNGX_VER" /src/ModSecurity-nginx && \
    git clone --depth 1 https://github.com/leev/ngx_http_geoip2_module --branch "$NHG2M_VER" /src/ngx_http_geoip2_module

# --- Build Step 3: Configure & Install Nginx ---
RUN cd /src/nginx && \
    /src/nginx/auto/configure \
    --build=nginx \
    --with-debug \
    --with-compat \
    --with-threads \
    --with-file-aio \
    --with-libatomic \
    --with-pcre \
    --with-pcre-jit \
    --without-select_module \
    --without-poll_module \
    --with-stream \
    --with-stream_ssl_module \
    --with-stream_ssl_preread_module \
    --with-stream_realip_module \
    --with-http_v2_module \
    --with-http_v3_module \
    --with-http_ssl_module \
    --with-http_realip_module \
    --with-http_gunzip_module \
    --with-http_gzip_static_module \
    --with-http_sub_module \
    --with-http_addition_module \
    --with-http_stub_status_module \
    --with-http_auth_request_module \
    --add-module=/src/ngx_brotli \
    --add-module=/src/ngx_unbrotli \
    --add-module=/src/zstd-nginx-module \
    --add-module=/src/ngx-fancyindex \
    --add-module=/src/headers-more-nginx-module \
    --add-module=/src/ngx_devel_kit \
    --add-module=/src/lua-nginx-module \
    --with-http_geoip_module=dynamic \
    --with-stream_geoip_module=dynamic \
    --add-dynamic-module=/src/nginx-auth-ldap \
    --add-dynamic-module=/src/nginx-module-vts \
    --add-dynamic-module=/src/nginx-ntlm-module \
    --add-dynamic-module=/src/ModSecurity-nginx \
    --add-dynamic-module=/src/ngx_http_geoip2_module \
    --with-ld-opt="$LDFLAGS" && \
    \
    make -j "$(nproc)" install && \
    ln -s /usr/local/nginx/sbin/nginx /usr/local/bin/nginx && \
    git clone --depth 1 https://github.com/openresty/lua-resty-core --branch "$LRC_VER" /src/lua-resty-core && \
    cd /src/lua-resty-core && \
    make -j "$(nproc)" install LUA_LIB_DIR=/usr/local/share/lua/5.1 && \
    git clone --depth 1 https://github.com/openresty/lua-resty-lrucache --branch "$LRL_VER" /src/lua-resty-lrucache && \
    cd /src/lua-resty-lrucache && \
    make -j "$(nproc)" install LUA_LIB_DIR=/usr/local/share/lua/5.1 && \
    git clone --depth 1 https://github.com/openresty/lua-resty-limit-traffic --branch "$LRLT_VER" /src/lua-resty-limit-traffic && \
    cd /src/lua-resty-limit-traffic && \
    make -j "$(nproc)" install LUA_LIB_DIR=/usr/local/share/lua/5.1

# --- Build Step 4: OpenAppSec Attachment ---
RUN git clone --depth 1 https://github.com/openappsec/attachment /src/attachment && \
    cd /src/attachment && \
    git apply /src/attachment.patch && \
    cmake /src/attachment -G Ninja && \
    ninja && \
    mv -v /src/attachment/attachments/nginx/ngx_module/libngx_module.so /usr/local/nginx/modules/libngx_module.so


# --- Cleanup: Strip Libraries ---
RUN find /usr/local/nginx/modules -name "*.so" -exec strip -s {} \; && \
    strip -s /usr/local/nginx/sbin/nginx && \
    strip -s /src/ModSecurity/src/.libs/libmodsecurity.so.3 && \
    strip -s /src/attachment/core/shmem_ipc/libosrc_shmem_ipc.so && \
    strip -s /src/attachment/core/compression/libosrc_compression_utils.so && \
    strip -s /src/attachment/attachments/nginx/nginx_attachment_util/libosrc_nginx_attachment_util.so && \
    \
    find /usr/local/nginx/modules -name "*.so" -exec file {} \; && \
    file /usr/local/nginx/sbin/nginx && \
    file /src/ModSecurity/src/.libs/libmodsecurity.so.3 && \
    file /src/attachment/core/shmem_ipc/libosrc_shmem_ipc.so && \
    file /src/attachment/core/compression/libosrc_compression_utils.so && \
    file /src/attachment/attachments/nginx/nginx_attachment_util/libosrc_nginx_attachment_util.so && \
    /usr/local/nginx/sbin/nginx -V


# ==========================================
# Stage 2: Build Frontend
# ==========================================
FROM --platform="$BUILDPLATFORM" alpine:3.23.2 AS frontend
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ARG NODE_ENV=production
COPY frontend /app
WORKDIR /app/frontend
RUN apk upgrade --no-cache -a && \
    apk add --no-cache nodejs yarn && \
    yarn install --production=false && \
    yarn tsc && \
    yarn vite build

# ==========================================
# Stage 3: Build Backend
# ==========================================
FROM alpine:3.23.2 AS backend
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ARG NODE_ENV=production
COPY backend /app
WORKDIR /app
RUN apk upgrade --no-cache -a && \
    apk add --no-cache nodejs yarn binutils file && \
    yarn install --production=false && \
    yarn cache clean && \
    find node_modules -name "*.map" -delete && \
    rm -r node_modules/better-sqlite3/deps/sqlite3 && \
    find /app/node_modules -name "*.node" -type f -exec strip -s {} \; && \
    find /app/node_modules -name "*.node" -type f -exec file {} \;


# ==========================================
# Stage 4: Certbot
# ==========================================
FROM python:3.14.0-alpine3.22 AS certbot
COPY nginx-quic/requirements.txt /tmp/requirements.txt
RUN apk upgrade --no-cache -a && \
    apk add --no-cache ca-certificates build-base libffi-dev && \
    python3 -m venv /usr/local && \
    pip install --no-cache-dir -r /tmp/requirements.txt


# ==========================================
# Final Stage
# ==========================================
FROM python:3.14.0-alpine3.22
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ENV NODE_ENV=production

# --- Args ---
ARG LRC_VER=v0.1.32R1
ARG LRL_VER=v0.15
ARG LCSB_VER=v1.0.13
ARG CRS_VER=v4.21.0

# --- Copy Artifacts ---
# From Nginx
COPY --from=nginx /usr/local/nginx                                                                         /usr/local/nginx
COPY --from=nginx /usr/local/share/lua/5.1                                                                 /usr/local/share/lua/5.1
COPY --from=nginx /src/ModSecurity/src/.libs/libmodsecurity.so.3                                           /usr/local/lib/libmodsecurity.so.3
COPY --from=nginx /src/ModSecurity/unicode.mapping                                                         /usr/local/nginx/conf/conf.d/include/unicode.mapping
COPY --from=nginx /src/ModSecurity/modsecurity.conf-recommended                                            /usr/local/nginx/conf/conf.d/include/modsecurity.conf.example
COPY --from=nginx /src/attachment/core/shmem_ipc/libosrc_shmem_ipc.so                                      /usr/local/lib/libosrc_shmem_ipc.so
COPY --from=nginx /src/attachment/core/compression/libosrc_compression_utils.so                            /usr/local/lib/libosrc_compression_utils.so
COPY --from=nginx /src/attachment/attachments/nginx/nginx_attachment_util/libosrc_nginx_attachment_util.so /usr/local/lib/libosrc_nginx_attachment_util.so

# From Certbot
COPY --from=certbot /usr/local /usr/local

# From Backend & Frontend
COPY --from=backend  /app      /app
COPY --from=frontend /app/dist /html/frontend

# Static Files
COPY rootfs /

# --- Setup ---
WORKDIR /app
RUN apk upgrade --no-cache -a && \
    apk add --no-cache tzdata tini \
                       luajit pcre2 zlib brotli zstd libssl3 libcrypto3 geoip libmaxminddb-libs libldap lua5.1-cjson \
                       curl coreutils findutils grep jq openssl shadow su-exec util-linux-misc \
                       bash bash-completion nano \
                       logrotate goaccess fcgi \
                       luarocks5.1 git make \
                       nodejs yarn && \
    \
    # Lua Rocks
    luarocks-5.1 install lua-resty-http && \
    luarocks-5.1 install lua-resty-string && \
    luarocks-5.1 install lua-resty-openssl && \
    luarocks-5.1 install lua-resty-openidc && \
    luarocks-5.1 install lua-resty-session && \
    \
    # OpenResty Libraries
    git clone --depth 1 https://github.com/openresty/lua-resty-core --branch "$LRC_VER" /src/lua-resty-core && \
    cd /src/lua-resty-core && \
    make -j "$(nproc)" install LUA_LIB_DIR=/usr/local/share/lua/5.1 && \
    \
    git clone --depth 1 https://github.com/openresty/lua-resty-lrucache --branch "$LRL_VER" /src/lua-resty-lrucache && \
    cd /src/lua-resty-lrucache && \
    make -j "$(nproc)" install LUA_LIB_DIR=/usr/local/share/lua/5.1 && \
    \
    # CrowdSec Bouncer
    git clone --depth 1 https://github.com/crowdsecurity/lua-cs-bouncer --branch "$LCSB_VER" /src/lua-cs-bouncer && \
    mv /src/lua-cs-bouncer/lib/* /usr/local/share/lua/5.1 && \
    mv /src/lua-cs-bouncer/templates/captcha.html /etc/captcha.html.original && \
    mv /src/lua-cs-bouncer/templates/ban.html /etc/ban.html.original && \
    \
    cd && \
    rm -rf /src /tmp/luarocks_local_cache-* && \
    \
    # Fix CrowdSec Version in Config
    sed -i "s|placeholder|$(cat /app/package.json | jq -r .version)|g" /usr/local/nginx/conf/conf.d/crowdsec.conf.disabled && \
    \
    # Python Venv & Certbot Tools
    python3 -m venv /opt/certbot && \
    /opt/certbot/bin/pip install --no-cache-dir --upgrade pip certbot && \
    ln -sf /opt/certbot/bin/certbot /usr/local/bin/certbot && \
    \
    # Helper Scripts
    curl -sSL https://raw.githubusercontent.com/tomwassenberg/certbot-ocsp-fetcher/refs/heads/main/certbot-ocsp-fetcher | sed "s|/live||g" > /usr/local/bin/certbot-ocsp-fetcher.sh && \
    curl -sSL https://raw.githubusercontent.com/vasilevich/nginxbeautifier/5cee8db2a505f2a253e24691399c828c043071fc/index.js -o /usr/local/bin/nginxbeautifier && \
    curl -sSL https://raw.githubusercontent.com/vasilevich/nginxbeautifier/5cee8db2a505f2a253e24691399c828c043071fc/nginxbeautifier.js -o /usr/local/bin/nginxbeautifier.js && \
    \
    # Symlinks & Permissions
    ln -s /usr/local/nginx/sbin/nginx /usr/local/bin/nginx && \
    ln -s /app/password-reset.js /usr/local/bin/password-reset.js && \
    ln -s /app/sqlite-vaccum.js /usr/local/bin/sqlite-vaccum.js && \
    ln -s /app/index.js /usr/local/bin/index.js && \
    \
    chmod +x /usr/local/bin/* && \
    \
    # Core Rule Set (Coreruleset)
    git clone --depth 1 https://github.com/coreruleset/coreruleset --branch "$CRS_VER" /tmp/coreruleset && \
    mkdir -v /usr/local/nginx/conf/conf.d/include/coreruleset && \
    mv -v /tmp/coreruleset/crs-setup.conf.example /usr/local/nginx/conf/conf.d/include/coreruleset/crs-setup.conf.example && \
    mv -v /tmp/coreruleset/plugins /usr/local/nginx/conf/conf.d/include/coreruleset/plugins && \
    mv -v /tmp/coreruleset/rules /usr/local/nginx/conf/conf.d/include/coreruleset/rules && \
    curl -sSL https://raw.githubusercontent.com/SpiderLabs/ModSecurity/v3/master/modsecurity.conf-recommended -o /usr/local/nginx/conf/conf.d/include/modsecurity.conf.example && \
    mkdir -p /var/log/nginx && \
    yarn global add nginxbeautifier && \
    yarn cache clean && \
    apk del --no-cache luarocks5.1 git make yarn && \
    ln -s /app/password-reset.js /usr/local/bin/password-reset.js && \
    ln -s /app/sqlite-vaccum.js /usr/local/bin/sqlite-vaccum.js && \
    ln -s /app/index.js /usr/local/bin/index.js && \
    rm -r /tmp/*

ENTRYPOINT ["tini", "--", "entrypoint.sh"]
HEALTHCHECK CMD healthcheck.sh
