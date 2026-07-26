# ==========================================
# Stage 1: Build Frontend
# ==========================================
ARG DEBIAN_IMAGE=debian:trixie-slim@sha256:020c0d20b9880058cbe785a9db107156c3c75c2ac944a6aa7ab59f2add76a7bd
ARG SHIELDPM_NGINX_IMAGE=ghcr.io/shedowe19/shieldpm-nginx:master

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
COPY scripts/setup-node-apt.sh /usr/local/bin/setup-node-apt.sh
RUN bash /usr/local/bin/setup-node-apt.sh && \
    apt-get install -y --no-install-recommends nodejs && \
    if command -v corepack >/dev/null 2>&1; then corepack install --global yarn@1.22.22; else npm install --global yarn@1.22.22; fi && \
    node --version | grep -E '^v26\.'
COPY backend /app
WORKDIR /app
# hadolint ignore=DL3016
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates binutils file curl make g++ python3 && \
    curl -L "https://github.com/TecharoHQ/anubis/releases/download/v1.25.0/anubis-1.25.0-linux-${TARGETARCH}.tar.gz" -o /tmp/anubis.tar.gz && \
    tar -xzf /tmp/anubis.tar.gz -C /app --strip-components=2 "anubis-1.25.0-linux-${TARGETARCH}/bin/anubis" && \
    rm /tmp/anubis.tar.gz && \
    chmod +x /app/anubis && \
    curl -L "https://github.com/oauth2-proxy/oauth2-proxy/releases/download/v7.15.2/oauth2-proxy-v7.15.2.linux-${TARGETARCH}.tar.gz" -o "/tmp/oauth2-proxy-v7.15.2.linux-${TARGETARCH}.tar.gz" && \
    tar -xzf "/tmp/oauth2-proxy-v7.15.2.linux-${TARGETARCH}.tar.gz" -C /app --strip-components=1 "oauth2-proxy-v7.15.2.linux-${TARGETARCH}/oauth2-proxy" && \
    rm "/tmp/oauth2-proxy-v7.15.2.linux-${TARGETARCH}.tar.gz" && \
    chmod +x /app/oauth2-proxy && \
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
HEALTHCHECK CMD healthcheck.sh
