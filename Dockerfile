# syntax=docker/dockerfile:labs

# ==========================================
# Stage 1: Build Nginx with Modules & Patches
# ==========================================
FROM debian:trixie-slim AS nginx
SHELL ["/bin/bash", "-eo", "pipefail", "-c"]

# --- Build Arguments: Versions ---
ARG NGINX_VER=release-1.29.5
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
ARG LRC_VER=v0.1.32R1
ARG LRL_VER=v0.15
ARG LRLT_VER=v0.09
ARG LCSB_VER=v1.0.13
ARG CRS_VER=v4.22.0


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
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
    autoconf automake libbrotli-dev build-essential ca-certificates clang cmake curl libcurl4-openssl-dev libgeoip-dev git \
    libatomic1 libatomic-ops-dev libmaxminddb-dev libtool libxml2-dev linux-headers-generic lld liblmdb-dev libluajit-5.1-dev luarocks \
    ninja-build libldap2-dev libssl-dev libpcre2-dev libyajl-dev zlib1g-dev libzstd-dev && \
    rm -rf /var/lib/apt/lists/*

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
    curl -sSL https://raw.githubusercontent.com/nginx-modules/ngx_http_tls_dyn_size/refs/heads/master/nginx__dynamic_tls_records_"$DTR_VER"%2B.patch -o /src/nginx/1.patch && \
    git apply /src/nginx/1.patch && \
    curl -sSL https://raw.githubusercontent.com/openresty/openresty/refs/heads/master/patches/nginx/"$RCP_VER"/nginx-"$RCP_VER"-resolver_conf_parsing.patch -o /src/nginx/2.patch && \
    git apply /src/nginx/2.patch && \
    curl -sSL https://patch-diff.githubusercontent.com/raw/nginx/nginx/pull/689.patch -o /src/nginx/3.patch && \
    git apply /src/nginx/3.patch && \
    sed -i "s|nginx/|ShieldPM/|g" /src/nginx/src/core/nginx.h && \
    sed -i "s|Server: nginx|Server: ShieldPM|g" /src/nginx/src/http/ngx_http_header_filter_module.c && \
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
    curl -sSL https://patch-diff.githubusercontent.com/raw/tokers/zstd-nginx-module/pull/44.patch -o /src/zstd-nginx-module/1.patch && \
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
    make -j "$(nproc)" install LUA_LIB_DIR=/usr/local/share/lua/5.1 && \
    \
    # Lua Rocks
    luarocks-5.1 install lua-resty-http && \
    luarocks-5.1 install lua-resty-string && \
    luarocks-5.1 install lua-resty-openssl && \
    luarocks-5.1 install lua-resty-openidc && \
    luarocks-5.1 install lua-resty-session && \
    \
    # CrowdSec Bouncer
    git clone --depth 1 https://github.com/crowdsecurity/lua-cs-bouncer --branch "$LCSB_VER" /src/lua-cs-bouncer && \
    mv /src/lua-cs-bouncer/lib/* /usr/local/share/lua/5.1 && \
    mkdir -p /usr/local/nginx/conf/conf.d/include && \
    mv /src/lua-cs-bouncer/templates/captcha.html /usr/local/nginx/conf/conf.d/include/captcha.html && \
    mv /src/lua-cs-bouncer/templates/ban.html /usr/local/nginx/conf/conf.d/include/ban.html && \
    \
    # Core Rule Set (Coreruleset)
    git clone --depth 1 https://github.com/coreruleset/coreruleset --branch "$CRS_VER" /tmp/coreruleset && \
    mkdir -v /usr/local/nginx/conf/conf.d/include/coreruleset && \
    mv -v /tmp/coreruleset/crs-setup.conf.example /usr/local/nginx/conf/conf.d/include/coreruleset/crs-setup.conf.example && \
    mv -v /tmp/coreruleset/plugins /usr/local/nginx/conf/conf.d/include/coreruleset/plugins && \
    mv -v /tmp/coreruleset/rules /usr/local/nginx/conf/conf.d/include/coreruleset/rules && \
    curl -sSL https://raw.githubusercontent.com/SpiderLabs/ModSecurity/v3/master/modsecurity.conf-recommended -o /usr/local/nginx/conf/conf.d/include/modsecurity.conf.example && \
    \
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
FROM --platform="$BUILDPLATFORM" debian:trixie-slim AS frontend
SHELL ["/bin/bash", "-eo", "pipefail", "-c"]
ARG NODE_ENV=production
COPY frontend /app
WORKDIR /app/frontend
# hadolint ignore=DL3016
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm && \
    npm install -g yarn && \
    yarn install --production=false && \
    yarn tsc && \
    yarn vite build && \
    rm -rf /var/lib/apt/lists/*


# ==========================================
# Stage 3: Build Backend
# ==========================================
FROM debian:trixie-slim AS backend
SHELL ["/bin/bash", "-eo", "pipefail", "-c"]
ARG NODE_ENV=production
COPY backend /app
WORKDIR /app
# hadolint ignore=DL3016
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm binutils file && \
    npm install -g yarn && \
    yarn install --production=false && \
    yarn cache clean && \
    find node_modules -name "*.map" -delete && \
    rm -r node_modules/better-sqlite3/deps/sqlite3 && \
    find /app/node_modules -name "*.node" -type f -exec strip -s {} \; && \
    find /app/node_modules -name "*.node" -type f -exec file {} \; && \
    rm -rf /var/lib/apt/lists/*


# ==========================================
# Stage 4: Certbot
# ==========================================
FROM debian:trixie-slim AS certbot
COPY nginx-quic/requirements.txt /tmp/requirements.txt
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates build-essential libffi-dev python3 python3-pip python3-venv && \
    python3 -m venv /usr/local && \
    /usr/local/bin/pip install --no-cache-dir -r /tmp/requirements.txt && \
    rm -rf /var/lib/apt/lists/*


# ==========================================
# Stage 5: Cloudflared
# ==========================================
FROM cloudflare/cloudflared:latest AS cloudflared

# ==========================================
# Final Stage
# ==========================================
FROM debian:trixie-slim
SHELL ["/bin/bash", "-eo", "pipefail", "-c"]
ENV NODE_ENV=production


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
COPY --from=cloudflared /usr/local/bin/cloudflared /usr/local/bin/cloudflared

# Static Files
COPY rootfs /

# --- Setup ---
WORKDIR /app
RUN echo "exit 101" > /usr/sbin/policy-rc.d && chmod +x /usr/sbin/policy-rc.d && \
    apt-get update && apt-get install -y --no-install-recommends -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" \
    libargon2-1 bash bash-completion brotli ca-certificates coreutils curl fcgiwrap findutils geoip-bin goaccess grep jq \
    libatomic1 libssl3 libedit2 libldap2 liblua5.1-0 libmaxminddb0 libxml2 liblmdb0 logrotate lua-cjson libluajit-5.1-2 \
    nano nodejs openssl libpcre2-8-0 python3 gosu tini tor tzdata util-linux libyajl2 zlib1g zstd && \
    # Fix CrowdSec Version in Config
    sed -i "s|placeholder|$(cat /app/package.json | jq -r .version)|g" /usr/local/nginx/conf/conf.d/include/crowdsec_nginx.conf && \
    # Helper Scripts
    curl -sSL https://raw.githubusercontent.com/tomwassenberg/certbot-ocsp-fetcher/refs/heads/main/certbot-ocsp-fetcher | sed "s|/live||g" > /usr/local/bin/certbot-ocsp-fetcher.sh && \
    curl -sSL https://raw.githubusercontent.com/vasilevich/nginxbeautifier/5cee8db2a505f2a253e24691399c828c043071fc/index.js -o /usr/local/bin/nginxbeautifier && \
    curl -sSL https://raw.githubusercontent.com/vasilevich/nginxbeautifier/5cee8db2a505f2a253e24691399c828c043071fc/nginxbeautifier.js -o /usr/local/bin/nginxbeautifier.js && \
    # Symlinks & Permissions
    ln -s /usr/local/nginx/sbin/nginx /usr/local/bin/nginx && \
    ln -s /app/password-reset.js /usr/local/bin/password-reset.js && \
    ln -s /app/sqlite-vaccum.js /usr/local/bin/sqlite-vaccum.js && \
    ln -s /app/index.js /usr/local/bin/index.js && \
    chmod +x /usr/local/bin/* && \
    mkdir -p /var/log/nginx && \
    find /tmp -mindepth 1 -delete && \
    rm -rf /var/lib/apt/lists/*

ENTRYPOINT ["tini", "--", "entrypoint.sh"]
HEALTHCHECK CMD healthcheck.sh
