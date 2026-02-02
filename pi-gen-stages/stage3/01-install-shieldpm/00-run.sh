#!/bin/bash -e
# Build and Install ShieldPM from source on Raspberry Pi
# This script compiles Nginx with all modules and builds the Node.js application

echo "=== Building ShieldPM from Source ==="

SRC_DIR="files/shieldpm-src"

if [ ! -d "$SRC_DIR" ]; then
    echo "ERROR: ShieldPM source not found at $SRC_DIR"
    exit 1
fi

# Copy source to chroot
cp -r "$SRC_DIR" "${ROOTFS_DIR}/tmp/shieldpm-src"

on_chroot << 'CHROOT_EOF'
set -e
cd /tmp/shieldpm-src

# === Module Versions (from Dockerfile) ===
NGINX_VER=release-1.29.4
DTR_VER=1.29.2
RCP_VER=1.29.4
MODSEC_VER=v3.0.14
MODSECNGX_VER=v1.0.4
NB_VER=master
NUB_VER=main
ZNM_VER=master
NF_VER=master
HMNM_VER=v0.39
NDK_VER=v0.3.4
LNM_VER=v0.10.29R2
NAL_VER=master
VTS_VER=v0.2.5
NNTLM_VER=master
NHG2M_VER=3.4
LRC_VER=v0.1.32R1
LRL_VER=v0.15
LRLT_VER=v0.09
LCSB_VER=v1.0.13
CRS_VER=v4.22.0

# === ARM64 Compiler Flags ===
export CC=clang
export CXX=clang++
export CFLAGS="-mbranch-protection=standard -O3 -pipe -fstack-clash-protection -fstack-protector-strong"
export CXXFLAGS="$CFLAGS"
export LDFLAGS="-fuse-ld=lld -Wl,-s -Wl,-O1 -Wl,-z,noexecstack -Wl,-z,relro -Wl,-z,now"

export LUAJIT_INC=/usr/include/luajit-2.1
export LUAJIT_LIB=/usr/lib

mkdir -p /src
cd /src

echo ">>> Building ModSecurity..."
git clone --depth 1 --shallow-submodules --recurse-submodules https://github.com/owasp-modsecurity/ModSecurity --branch "$MODSEC_VER" /src/ModSecurity
cd /src/ModSecurity
sed -i "s|SecRuleEngine .*|SecRuleEngine On|g" modsecurity.conf-recommended
sed -i "s|^SecAudit|#SecAudit|g" modsecurity.conf-recommended
sed -i "s|unicode.mapping|/usr/local/nginx/conf/conf.d/include/unicode.mapping|g" modsecurity.conf-recommended
sed -i "1i #include <stdint.h>" headers/modsecurity/collection/collection.h
./build.sh
./configure --with-pcre2 --with-lmdb
make -j "$(nproc)" install

echo ">>> Cloning Nginx and modules..."
git clone --depth 1 https://github.com/nginx/nginx --branch "$NGINX_VER" /src/nginx
cd /src/nginx

# Apply patches
curl -sSL https://raw.githubusercontent.com/nginx-modules/ngx_http_tls_dyn_size/refs/heads/master/nginx__dynamic_tls_records_${DTR_VER}%2B.patch | git apply || true
curl -sSL https://raw.githubusercontent.com/openresty/openresty/refs/heads/master/patches/nginx/${RCP_VER}/nginx-${RCP_VER}-resolver_conf_parsing.patch | git apply || true
curl -sSL https://patch-diff.githubusercontent.com/raw/nginx/nginx/pull/689.patch | git apply || true

# Rebrand
sed -i "s|nginx/|ShieldPM/|g" src/core/nginx.h
sed -i "s|Server: nginx|Server: ShieldPM|g" src/http/ngx_http_header_filter_module.c

# Clone modules
git clone --depth 1 --recurse-submodules https://github.com/google/ngx_brotli --branch "$NB_VER" /src/ngx_brotli
git clone --depth 1 https://github.com/clyfish/ngx_unbrotli --branch "$NUB_VER" /src/ngx_unbrotli
git clone --depth 1 https://github.com/tokers/zstd-nginx-module --branch "$ZNM_VER" /src/zstd-nginx-module
git clone --depth 1 https://github.com/Zoey2936/ngx-fancyindex --branch "$NF_VER" /src/ngx-fancyindex
git clone --depth 1 https://github.com/openresty/headers-more-nginx-module --branch "$HMNM_VER" /src/headers-more-nginx-module
git clone --depth 1 https://github.com/vision5/ngx_devel_kit --branch "$NDK_VER" /src/ngx_devel_kit
git clone --depth 1 https://github.com/openresty/lua-nginx-module --branch "$LNM_VER" /src/lua-nginx-module
git clone --depth 1 https://github.com/kvspb/nginx-auth-ldap --branch "$NAL_VER" /src/nginx-auth-ldap
git clone --depth 1 https://github.com/vozlt/nginx-module-vts --branch "$VTS_VER" /src/nginx-module-vts
git clone --depth 1 https://github.com/gabihodoroaga/nginx-ntlm-module --branch "$NNTLM_VER" /src/nginx-ntlm-module
git clone --depth 1 https://github.com/SpiderLabs/ModSecurity-nginx --branch "$MODSECNGX_VER" /src/ModSecurity-nginx
git clone --depth 1 https://github.com/leev/ngx_http_geoip2_module --branch "$NHG2M_VER" /src/ngx_http_geoip2_module

echo ">>> Configuring Nginx..."
cd /src/nginx
./auto/configure \
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
    --with-ld-opt="$LDFLAGS"

echo ">>> Building Nginx..."
make -j "$(nproc)" install

# Symlink
ln -sf /usr/local/nginx/sbin/nginx /usr/local/bin/nginx

echo ">>> Installing Lua libraries..."
git clone --depth 1 https://github.com/openresty/lua-resty-core --branch "$LRC_VER" /src/lua-resty-core
cd /src/lua-resty-core && make install LUA_LIB_DIR=/usr/local/share/lua/5.1

git clone --depth 1 https://github.com/openresty/lua-resty-lrucache --branch "$LRL_VER" /src/lua-resty-lrucache
cd /src/lua-resty-lrucache && make install LUA_LIB_DIR=/usr/local/share/lua/5.1

git clone --depth 1 https://github.com/openresty/lua-resty-limit-traffic --branch "$LRLT_VER" /src/lua-resty-limit-traffic
cd /src/lua-resty-limit-traffic && make install LUA_LIB_DIR=/usr/local/share/lua/5.1

# Lua Rocks
luarocks-5.1 install lua-resty-http || true
luarocks-5.1 install lua-resty-string || true
luarocks-5.1 install lua-resty-openssl || true
luarocks-5.1 install lua-resty-openidc || true
luarocks-5.1 install lua-resty-session || true

# CrowdSec Bouncer
git clone --depth 1 https://github.com/crowdsecurity/lua-cs-bouncer --branch "$LCSB_VER" /src/lua-cs-bouncer
mv /src/lua-cs-bouncer/lib/* /usr/local/share/lua/5.1/
mkdir -p /usr/local/nginx/conf/conf.d/include
mv /src/lua-cs-bouncer/templates/captcha.html /usr/local/nginx/conf/conf.d/include/
mv /src/lua-cs-bouncer/templates/ban.html /usr/local/nginx/conf/conf.d/include/

# Core Rule Set
git clone --depth 1 https://github.com/coreruleset/coreruleset --branch "$CRS_VER" /tmp/coreruleset
mkdir -p /usr/local/nginx/conf/conf.d/include/coreruleset
mv /tmp/coreruleset/crs-setup.conf.example /usr/local/nginx/conf/conf.d/include/coreruleset/
mv /tmp/coreruleset/plugins /usr/local/nginx/conf/conf.d/include/coreruleset/
mv /tmp/coreruleset/rules /usr/local/nginx/conf/conf.d/include/coreruleset/

# ModSecurity config
cp /src/ModSecurity/unicode.mapping /usr/local/nginx/conf/conf.d/include/
cp /src/ModSecurity/modsecurity.conf-recommended /usr/local/nginx/conf/conf.d/include/modsecurity.conf.example

echo ">>> Building OpenAppSec Attachment..."
git clone --depth 1 https://github.com/openappsec/attachment /src/attachment
cd /src/attachment
# Apply patch if exists
if [ -f /tmp/shieldpm-src/nginx-quic/attachment.patch ]; then
    git apply /tmp/shieldpm-src/nginx-quic/attachment.patch || true
fi
cmake /src/attachment -G Ninja
ninja
mkdir -p /usr/local/nginx/modules
mv /src/attachment/attachments/nginx/ngx_module/libngx_module.so /usr/local/nginx/modules/libngx_module.so
# Copy OpenAppSec libraries
cp /src/attachment/core/shmem_ipc/libosrc_shmem_ipc.so /usr/local/lib/
cp /src/attachment/core/compression/libosrc_compression_utils.so /usr/local/lib/
cp /src/attachment/attachments/nginx/nginx_attachment_util/libosrc_nginx_attachment_util.so /usr/local/lib/

echo ">>> Installing Certbot with all DNS plugins..."
python3 -m venv /usr/local/certbot-venv
/usr/local/certbot-venv/bin/pip install --no-cache-dir \
    certbot \
    certbot-dns-cloudflare \
    certbot-dns-route53 \
    certbot-dns-google \
    certbot-dns-digitalocean \
    certbot-dns-ovh \
    certbot-dns-rfc2136 \
    certbot-dns-linode || true
ln -sf /usr/local/certbot-venv/bin/certbot /usr/local/bin/certbot

echo ">>> Building Frontend..."
cd /tmp/shieldpm-src/frontend
npm install -g yarn
yarn install --production=false
yarn tsc
yarn vite build
mkdir -p /html/frontend
cp -r dist/* /html/frontend/

echo ">>> Installing Backend..."
cd /tmp/shieldpm-src/backend
yarn install --production=true
yarn cache clean
mkdir -p /app
cp -r . /app/

echo ">>> Copying rootfs overlays..."
cp -r /tmp/shieldpm-src/rootfs/* /

echo ">>> Installing Cloudflared..."
curl -sSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

echo ">>> Setting up helper scripts..."
# Symlinks like in Dockerfile
ln -sf /app/password-reset.js /usr/local/bin/password-reset.js
ln -sf /app/sqlite-vaccum.js /usr/local/bin/sqlite-vaccum.js
ln -sf /app/index.js /usr/local/bin/index.js
ln -sf /usr/local/bin/update-shieldpm /usr/bin/update
chmod +x /usr/local/bin/* 2>/dev/null || true

# Helper scripts from Dockerfile
curl -sSL https://raw.githubusercontent.com/tomwassenberg/certbot-ocsp-fetcher/refs/heads/main/certbot-ocsp-fetcher | sed "s|/live||g" > /usr/local/bin/certbot-ocsp-fetcher.sh
curl -sSL https://raw.githubusercontent.com/vasilevich/nginxbeautifier/5cee8db2a505f2a253e24691399c828c043071fc/index.js -o /usr/local/bin/nginxbeautifier
curl -sSL https://raw.githubusercontent.com/vasilevich/nginxbeautifier/5cee8db2a505f2a253e24691399c828c043071fc/nginxbeautifier.js -o /usr/local/bin/nginxbeautifier.js
chmod +x /usr/local/bin/certbot-ocsp-fetcher.sh

echo ">>> Stripping libraries..."
find /usr/local/nginx/modules -name "*.so" -exec strip -s {} \; 2>/dev/null || true
strip -s /usr/local/nginx/sbin/nginx 2>/dev/null || true
strip -s /usr/local/lib/libmodsecurity.so.3 2>/dev/null || true
strip -s /usr/local/lib/libosrc_*.so 2>/dev/null || true

echo ">>> Setting up library paths..."
echo '/usr/local/lib' > /etc/ld.so.conf.d/shieldpm.conf
ldconfig

echo ">>> Creating directories..."
mkdir -p /var/log/nginx /data/shieldpm /data/nginx /data/tls /data/access /data/logs /data/tor

echo ">>> Cleanup..."
rm -rf /src /tmp/shieldpm-src /tmp/coreruleset
apt-get clean
rm -rf /var/lib/apt/lists/*

echo ">>> ShieldPM build complete!"
CHROOT_EOF

