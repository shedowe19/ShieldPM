# ==========================================
# Stage 1: Build Frontend
# ==========================================
FROM --platform="$BUILDPLATFORM" debian:trixie-slim AS frontend
SHELL ["/bin/bash", "-eo", "pipefail", "-c"]
ARG NODE_ENV=production
COPY frontend /app
WORKDIR /app
# yarn 4 is bundled via yarnPath — no global install needed
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm && \
    npm install -g corepack && \
    corepack enable && \
    yarn install && \
    yarn tsc && \
    yarn vite build && \
    rm -rf /var/lib/apt/lists/*


# ==========================================
# Stage 2: Build Backend
# ==========================================
FROM debian:trixie-slim AS backend
SHELL ["/bin/bash", "-eo", "pipefail", "-c"]
ARG NODE_ENV=production
ARG TARGETARCH
COPY backend /app
WORKDIR /app
# hadolint ignore=DL3016
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm binutils file curl && \
    curl -L "https://github.com/TecharoHQ/anubis/releases/download/v1.25.0/anubis-1.25.0-linux-${TARGETARCH}.tar.gz" -o /tmp/anubis.tar.gz && \
    tar -xzf /tmp/anubis.tar.gz -C /app --strip-components=2 "anubis-1.25.0-linux-${TARGETARCH}/bin/anubis" && \
    rm /tmp/anubis.tar.gz && \
    chmod +x /app/anubis && \
    curl -L "https://github.com/oauth2-proxy/oauth2-proxy/releases/download/v7.14.2/oauth2-proxy-v7.14.2.linux-${TARGETARCH}.tar.gz" -o "/tmp/oauth2-proxy-v7.14.2.linux-${TARGETARCH}.tar.gz" && \
    tar -xzf "/tmp/oauth2-proxy-v7.14.2.linux-${TARGETARCH}.tar.gz" -C /app --strip-components=1 "oauth2-proxy-v7.14.2.linux-${TARGETARCH}/oauth2-proxy" && \
    rm "/tmp/oauth2-proxy-v7.14.2.linux-${TARGETARCH}.tar.gz" && \
    chmod +x /app/oauth2-proxy && \
    npm install -g corepack && \
    corepack enable && \
    yarn install && \
    yarn cache clean --all && \
    find node_modules -name "*.map" -delete && \
    rm -r node_modules/better-sqlite3/deps/sqlite3 && \
    find /app/node_modules -name "*.node" -type f -exec strip -s {} \; && \
    find /app/node_modules -name "*.node" -type f -exec file {} \; && \
    rm -rf /var/lib/apt/lists/*


# ==========================================
# Final Stage
# ==========================================
FROM ghcr.io/shedowe19/shieldpm-nginx:master
SHELL ["/bin/bash", "-eo", "pipefail", "-c"]
ENV NODE_ENV=production


# --- Copy Artifacts ---

# From Backend & Frontend
COPY --from=backend  /app      /app
COPY --from=backend  /app/anubis /usr/local/bin/anubis
COPY --from=backend  /app/oauth2-proxy /usr/local/bin/oauth2-proxy
COPY --from=frontend /app/dist /html/frontend

# Static Files
COPY rootfs /

# --- Setup ---
WORKDIR /app
# Install guacd (Apache Guacamole proxy daemon — FreeRDP backend for RDP/NLA support)
# guacd is only available in Debian Bullseye (not Bookworm/Trixie), so we add the
# Bullseye repo temporarily, install guacd + its deps, then remove the repo again.
# libssl1.1 (Bullseye) and libssl3 (Trixie) use different SONAMEs and coexist safely.
# hadolint ignore=DL3008,DL3009
RUN echo "deb http://deb.debian.org/debian bullseye main" > /etc/apt/sources.list.d/bullseye-guacd.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends -t bullseye guacd && \
    rm /etc/apt/sources.list.d/bullseye-guacd.list && \
    rm -rf /var/lib/apt/lists/*

# Download Guacamole JS client (must match guacd protocol version)
RUN curl -fsSL "https://cdn.jsdelivr.net/npm/guacamole-common-js@1.5.0/dist/cjs/guacamole-common.min.js" \
    -o /html/rdp/guacamole-common.min.js

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
