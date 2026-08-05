# ==========================================
# Stage 1: Build Frontend
# ==========================================
ARG DEBIAN_IMAGE=debian:trixie-slim@sha256:020c0d20b9880058cbe785a9db107156c3c75c2ac944a6aa7ab59f2add76a7bd
ARG SHIELDPM_NGINX_IMAGE=ghcr.io/shedowe19/shieldpm-nginx:master@sha256:86a3240d7648f873be17f74de1785822038edff6a02cfbebc27257ff8b2eb222

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
# Final Stage
# ==========================================
FROM ${SHIELDPM_NGINX_IMAGE}
SHELL ["/bin/bash", "-eo", "pipefail", "-c"]
ENV NODE_ENV=production
COPY scripts/setup-node-apt.sh /usr/local/bin/setup-node-apt.sh
RUN bash /usr/local/bin/setup-node-apt.sh && \
    apt-get install -y --no-install-recommends nodejs && \
    node --version | grep -E '^v26\.' && \
    rm -rf /var/lib/apt/lists/*


# --- Copy Artifacts ---

# From Backend & Frontend
COPY --from=backend  /app      /app
COPY --from=backend  /app/anubis /usr/local/bin/anubis
COPY --from=backend  /app/oauth2-proxy /usr/local/bin/oauth2-proxy
COPY --from=backend  /app/cloudflared /usr/local/bin/cloudflared
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
