# ==========================================
# Stage 1: Build Frontend
# ==========================================
ARG DEBIAN_IMAGE=debian:trixie-slim@sha256:3a39a0592364683e6bab97937b72cad5a8fa6dcbbee90edb3bb48c7f8e94f258
ARG SHIELDPM_NGINX_IMAGE=ghcr.io/shedowe19/shieldpm-nginx:master@sha256:3101e050806f21c3a527dbf548688f949d5fcf6af0a58affb2641b2605cae54a

# Immutable image digest is supplied by the declared build argument.
# hadolint ignore=DL3006
FROM --platform="$BUILDPLATFORM" ${DEBIAN_IMAGE} AS frontend
SHELL ["/bin/bash", "-eo", "pipefail", "-c"]
ARG NODE_ENV=production
COPY scripts/setup-node-apt.sh /usr/local/bin/setup-node-apt.sh
RUN bash /usr/local/bin/setup-node-apt.sh && \
    apt-get install -y --no-install-recommends nodejs && \
    if command -v corepack >/dev/null 2>&1; then corepack install --global yarn@1.22.22; else npm install --global yarn@1.22.22; fi && \
    node --version | grep -E '^v26\.' && \
    rm -rf /var/lib/apt/lists/*
COPY frontend /app
WORKDIR /app
RUN yarn install --frozen-lockfile --production=false && \
    yarn tsc && \
    yarn vite build


# ==========================================
# Stage 2: Build Backend
# ==========================================
# Immutable image digest is supplied by the declared build argument.
# hadolint ignore=DL3006
FROM ${DEBIAN_IMAGE} AS backend
SHELL ["/bin/bash", "-eo", "pipefail", "-c"]
ARG NODE_ENV=production
ARG TARGETARCH
ARG ANUBIS_VERSION=1.26.2
ARG ANUBIS_SHA256_AMD64=8d1792d69c4a6e360fbfa0657ac252dcbce5639e6441b09252cd8ae1474ea306
ARG ANUBIS_SHA256_ARM64=6caed9d09729b0fa1b4d23a6e55b491d24c81901c105e10ccd95b7e8db3a4620
ARG OAUTH2_PROXY_VERSION=7.15.3
ARG OAUTH2_PROXY_SHA256_AMD64=0ae5a43adde4d6c5081ba018e70a76041f496377b12a173da36b419082dd1ab6
ARG OAUTH2_PROXY_SHA256_ARM64=62452322a71e958d4d6911f799bc07921212a5f3bc45e39b63746e422d52ea33
ARG CLOUDFLARED_VERSION=2026.7.3
ARG CLOUDFLARED_SHA256_AMD64=9d71c677db00134c1bd4144b7783486b654ad281b1ea62b4972098d19f770f17
ARG CLOUDFLARED_SHA256_ARM64=65259e652a7bea08bf5df603233ab22b8bf3116af8df9f9206209af6a1b955c0
COPY scripts/setup-node-apt.sh /usr/local/bin/setup-node-apt.sh
RUN bash /usr/local/bin/setup-node-apt.sh && \
    apt-get install -y --no-install-recommends nodejs && \
    if command -v corepack >/dev/null 2>&1; then corepack install --global yarn@1.22.22; else npm install --global yarn@1.22.22; fi && \
    node --version | grep -E '^v26\.'
COPY backend /app
WORKDIR /app
# hadolint ignore=DL3016
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates binutils file curl make g++ python3 && \
    case "$TARGETARCH" in \
        amd64) \
            release_arch=amd64; \
            anubis_sha256="$ANUBIS_SHA256_AMD64"; \
            oauth2_proxy_sha256="$OAUTH2_PROXY_SHA256_AMD64"; \
            cloudflared_sha256="$CLOUDFLARED_SHA256_AMD64" ;; \
        arm64) \
            release_arch=arm64; \
            anubis_sha256="$ANUBIS_SHA256_ARM64"; \
            oauth2_proxy_sha256="$OAUTH2_PROXY_SHA256_ARM64"; \
            cloudflared_sha256="$CLOUDFLARED_SHA256_ARM64" ;; \
        *) echo "Unsupported target architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac && \
    curl --fail --location --proto '=https' --retry 3 \
        "https://github.com/TecharoHQ/anubis/releases/download/v${ANUBIS_VERSION}/anubis-${ANUBIS_VERSION}-linux-${release_arch}.tar.gz" \
        -o /tmp/anubis.tar.gz && \
    printf '%s  %s\n' "$anubis_sha256" /tmp/anubis.tar.gz | sha256sum --check --status && \
    tar -xzf /tmp/anubis.tar.gz -C /app --strip-components=2 "anubis-${ANUBIS_VERSION}-linux-${release_arch}/bin/anubis" && \
    rm /tmp/anubis.tar.gz && \
    chmod 0755 /app/anubis && \
    curl --fail --location --proto '=https' --retry 3 \
        "https://github.com/oauth2-proxy/oauth2-proxy/releases/download/v${OAUTH2_PROXY_VERSION}/oauth2-proxy-v${OAUTH2_PROXY_VERSION}.linux-${release_arch}.tar.gz" \
        -o /tmp/oauth2-proxy.tar.gz && \
    printf '%s  %s\n' "$oauth2_proxy_sha256" /tmp/oauth2-proxy.tar.gz | sha256sum --check --status && \
    tar -xzf /tmp/oauth2-proxy.tar.gz -C /app --strip-components=1 "oauth2-proxy-v${OAUTH2_PROXY_VERSION}.linux-${release_arch}/oauth2-proxy" && \
    rm /tmp/oauth2-proxy.tar.gz && \
    chmod 0755 /app/oauth2-proxy && \
    curl --fail --location --proto '=https' --retry 3 \
        "https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-${release_arch}" \
        -o /app/cloudflared && \
    printf '%s  %s\n' "$cloudflared_sha256" /app/cloudflared | sha256sum --check --status && \
    chmod 0755 /app/cloudflared && \
    yarn install --frozen-lockfile --production=false && \
    yarn cache clean && \
    find node_modules -name "*.map" -delete && \
    rm -r node_modules/better-sqlite3/deps/sqlite3 && \
    find /app/node_modules -name "*.node" -type f -exec strip -s {} \; && \
    find /app/node_modules -name "*.node" -type f -exec file {} \; && \
    rm -rf /var/lib/apt/lists/*


# ==========================================
# Stage 3: Production Backend Runtime
# ==========================================
# Keep build tooling and test-only dependencies out of the final image. Native
# modules were built in the preceding stage and are retained by Yarn's prune.
FROM backend AS backend-runtime
RUN yarn install --frozen-lockfile --production=true && \
    yarn cache clean && \
    find node_modules -name "*.map" -delete && \
    rm -rf node_modules/better-sqlite3/deps/sqlite3 && \
    mkdir -p /runtime-app && \
    cp -a /app/. /runtime-app && \
    rm -rf /runtime-app/node_modules


# ==========================================
# Final Stage
# ==========================================
# Immutable image digest is supplied by the declared build argument.
# hadolint ignore=DL3006
FROM ${SHIELDPM_NGINX_IMAGE}
SHELL ["/bin/bash", "-eo", "pipefail", "-c"]
ARG TARGETARCH
# npm 12.0.2: SHA-512 derived from the npm registry's published SRI metadata.
ARG NPM_VERSION=12.0.2
ARG NPM_TARBALL_SHA512=b885e890b9418fa1693544d05f53e64f9a73ec194837d4258b15fecdd692347b1dd2a517b1b0cbaf9d31cd8e92c3b70956bd2ecc72833a57b4b3098f5bfa7943
# Current npm 12.0.2 bundles older semver-compatible internals; replace only the fixed,
# verified package trees until npm ships the corresponding bundled revisions.
ARG NPM_BRACE_EXPANSION_VERSION=5.0.9
ARG NPM_BRACE_EXPANSION_SHA512=49c43822ebc8105d533253fb66dfaf8c9ffff7394f6f64837315b13376e4f2ceade8619d27b28ed5d09c4e274e3c929e3d6df42c4ff6713ef00b23e1a3dfd6c6
ARG NPM_IP_ADDRESS_VERSION=10.3.1
ARG NPM_IP_ADDRESS_SHA512=d5ef5dde46fdecd1c94c8243656f6b2aa5b687af9d15ae740f2d1fa4f48c429d800e37b982f2ac5e67622ba770639b7be93693b79f8fe4dd58fcba13a08c4fea
# cryptography 50.0.0 CPython abi3 manylinux_2_34 wheels, verified against PyPI SHA-256 digests.
ARG CRYPTOGRAPHY_VERSION=50.0.0
ARG CRYPTOGRAPHY_AMD64_URL=https://files.pythonhosted.org/packages/da/3a/f05e32c99d440c9bb891ea0e36c9091891e36be5a9a87ab2ee6ea20729f6/cryptography-50.0.0-cp311-abi3-manylinux_2_34_x86_64.whl
ARG CRYPTOGRAPHY_AMD64_SHA256=82148ec5bddac30b51a5b3c1945075f896fa022cb93f8e4a01e9f6ee95292c5f
ARG CRYPTOGRAPHY_ARM64_URL=https://files.pythonhosted.org/packages/32/98/8a151d64367204cbc63ec65d37502f1d9c53cf4bfc6ec3c532614dbec60d/cryptography-50.0.0-cp311-abi3-manylinux_2_34_aarch64.whl
ARG CRYPTOGRAPHY_ARM64_SHA256=07949c449a1abcf60d1ee6e88956d89404c7df3c8258f46589e912988e551987
ENV NODE_ENV=production
COPY scripts/setup-node-apt.sh /usr/local/bin/setup-node-apt.sh
# A local tarball with an exact SHA-512 is installed below; Hadolint cannot infer that pin.
# hadolint ignore=DL3016
RUN bash /usr/local/bin/setup-node-apt.sh && \
    apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends nodejs && \
    node --version | grep -E '^v26\.' && \
    npm_tarball="/tmp/npm-${NPM_VERSION}.tgz" && \
    curl --fail --location --proto '=https' --tlsv1.2 --retry 3 --output "$npm_tarball" "https://registry.npmjs.org/npm/-/npm-${NPM_VERSION}.tgz" && \
    printf '%s  %s\n' "$NPM_TARBALL_SHA512" "$npm_tarball" | sha512sum -c - && \
    npm install --global --ignore-scripts "$npm_tarball" && \
    test "$(npm --version)" = "$NPM_VERSION" && \
    brace_tarball="/tmp/brace-expansion-${NPM_BRACE_EXPANSION_VERSION}.tgz" && \
    ip_address_tarball="/tmp/ip-address-${NPM_IP_ADDRESS_VERSION}.tgz" && \
    curl --fail --location --proto '=https' --tlsv1.2 --retry 3 --output "$brace_tarball" "https://registry.npmjs.org/brace-expansion/-/brace-expansion-${NPM_BRACE_EXPANSION_VERSION}.tgz" && \
    curl --fail --location --proto '=https' --tlsv1.2 --retry 3 --output "$ip_address_tarball" "https://registry.npmjs.org/ip-address/-/ip-address-${NPM_IP_ADDRESS_VERSION}.tgz" && \
    printf '%s  %s\n' "$NPM_BRACE_EXPANSION_SHA512" "$brace_tarball" | sha512sum -c - && \
    printf '%s  %s\n' "$NPM_IP_ADDRESS_SHA512" "$ip_address_tarball" | sha512sum -c - && \
    rm -rf /usr/lib/node_modules/npm/node_modules/brace-expansion /usr/lib/node_modules/npm/node_modules/ip-address && \
    mkdir -p /usr/lib/node_modules/npm/node_modules/brace-expansion /usr/lib/node_modules/npm/node_modules/ip-address && \
    tar -xzf "$brace_tarball" -C /usr/lib/node_modules/npm/node_modules/brace-expansion --strip-components=1 && \
    tar -xzf "$ip_address_tarball" -C /usr/lib/node_modules/npm/node_modules/ip-address --strip-components=1 && \
    test "$(node -p 'require("/usr/lib/node_modules/npm/node_modules/brace-expansion/package.json").version')" = "$NPM_BRACE_EXPANSION_VERSION" && \
    test "$(node -p 'require("/usr/lib/node_modules/npm/node_modules/ip-address/package.json").version')" = "$NPM_IP_ADDRESS_VERSION" && \
    case "$TARGETARCH" in \
        amd64) cryptography_url="$CRYPTOGRAPHY_AMD64_URL"; cryptography_sha256="$CRYPTOGRAPHY_AMD64_SHA256" ;; \
        arm64) cryptography_url="$CRYPTOGRAPHY_ARM64_URL"; cryptography_sha256="$CRYPTOGRAPHY_ARM64_SHA256" ;; \
        *) echo "Unsupported target architecture for cryptography wheel: $TARGETARCH" >&2; exit 1 ;; \
    esac && \
    cryptography_wheel="/tmp/${cryptography_url##*/}" && \
    curl --fail --location --proto '=https' --tlsv1.2 --retry 3 --output "$cryptography_wheel" "$cryptography_url" && \
    printf '%s  %s\n' "$cryptography_sha256" "$cryptography_wheel" | sha256sum -c - && \
    python3 -m pip install --no-cache-dir --no-deps "$cryptography_wheel" && \
    python3 -c "import cryptography; assert cryptography.__version__ == '${CRYPTOGRAPHY_VERSION}'" && \
    rm -rf /var/lib/apt/lists/* /tmp/nodejs.list /tmp/nodesource.gpg /tmp/nodesource.gpg.key "$npm_tarball" "$brace_tarball" "$ip_address_tarball" "$cryptography_wheel"


# --- Copy Artifacts ---

# From Backend & Frontend. The runtime stage excludes development node_modules.
COPY --from=backend-runtime /runtime-app /app
COPY --from=backend-runtime /app/node_modules /app/node_modules
COPY --from=backend-runtime /app/anubis /usr/local/bin/anubis
COPY --from=backend-runtime /app/oauth2-proxy /usr/local/bin/oauth2-proxy
COPY --from=backend-runtime /app/cloudflared /usr/local/bin/cloudflared
COPY --from=frontend /app/dist /html/frontend

# Static Files
COPY rootfs /

# --- WireGuard Support ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    wireguard-tools \
    iproute2 \
    iptables \
    wireguard-go \
    procps \
    && rm -rf /var/lib/apt/lists/*

# --- Setup ---
WORKDIR /app
RUN echo "exit 101" > /usr/sbin/policy-rc.d && chmod +x /usr/sbin/policy-rc.d && \
    # Helper Scripts
    # NOTE: These scripts are specific to ShieldPM logic, so we keep pulling them here or bundled in backend
    # If they are generic, they could move to base, but they seem app-specific or small enough.
    # We'll re-download them to be safe, or if they were in base we wouldn't need to.
    # The base image already has certbot-ocsp-fetcher and nginxbeautifier.
    # So we only need to link the app specific scripts.
    #
    # Symlinks & Permissions
    ln -s /app/password-reset.js /usr/local/bin/password-reset.js && \
    ln -s /app/sqlite-vaccum.js /usr/local/bin/sqlite-vaccum.js && \
    ln -s /app/index.js /usr/local/bin/index.js && \
    chmod +x /usr/local/bin/* && \
    mkdir -p /var/log/nginx && \
    find /tmp -mindepth 1 -delete

ENTRYPOINT ["tini", "--", "entrypoint.sh"]
HEALTHCHECK CMD ["healthcheck.sh"]
