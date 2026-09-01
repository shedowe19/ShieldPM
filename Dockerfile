# ==========================================
# Stage 1: Build Frontend
# ==========================================
ARG DEBIAN_IMAGE=debian:trixie-slim@sha256:3a39a0592364683e6bab97937b72cad5a8fa6dcbbee90edb3bb48c7f8e94f258
# Deliberately has no moving-tag default. CI/operators must provide a reviewed,
# multi-architecture digest such as ghcr.io/.../shieldpm-nginx@sha256:<64 hex>.
ARG SHIELDPM_NGINX_IMAGE

FROM --platform="$BUILDPLATFORM" ${DEBIAN_IMAGE} AS frontend
SHELL ["/bin/bash", "-eo", "pipefail", "-c"]
ARG NODE_ENV=production
COPY scripts/setup-node-apt.sh /usr/local/bin/setup-node-apt.sh
RUN bash /usr/local/bin/setup-node-apt.sh && \
    apt-get install -y --no-install-recommends nodejs && \
    npm install --global --ignore-scripts corepack@0.36.0 && \
    corepack enable && corepack install --global yarn@4.18.0 && \
    node --version | grep -E '^v24\.' && \
    rm -rf /var/lib/apt/lists/*
COPY frontend /app
WORKDIR /app
RUN yarn install --immutable && \
    yarn build


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
    npm install --global --ignore-scripts corepack@0.36.0 && \
    corepack enable && corepack install --global yarn@4.18.0 && \
    node --version | grep -E '^v24\.'
COPY backend /app
WORKDIR /app
# hadolint ignore=DL3016
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates binutils file curl make g++ python3 && \
    case "$TARGETARCH" in \
      amd64) ANUBIS_SHA256="092f92b1710ee2eb208f019733f6ce06cbc041884272340bea13635a4515c357"; \
             OAUTH2_PROXY_SHA256="0ae5a43adde4d6c5081ba018e70a76041f496377b12a173da36b419082dd1ab6" ;; \
      arm64) ANUBIS_SHA256="3091be707f9454d172cbe611f36ea74046701d735b4a574c99cee6e41884ecb1"; \
             OAUTH2_PROXY_SHA256="62452322a71e958d4d6911f799bc07921212a5f3bc45e39b63746e422d52ea33" ;; \
      *) echo "Unsupported target architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac && \
    curl --fail --location --proto '=https' --tlsv1.2 \
      "https://github.com/TecharoHQ/anubis/releases/download/v1.27.0/anubis-1.27.0-linux-${TARGETARCH}.tar.gz" \
      --output /tmp/anubis.tar.gz && \
    echo "${ANUBIS_SHA256}  /tmp/anubis.tar.gz" | sha256sum --check --strict - && \
    tar -xzf /tmp/anubis.tar.gz -C /app --strip-components=2 "anubis-1.27.0-linux-${TARGETARCH}/bin/anubis" && \
    rm /tmp/anubis.tar.gz && \
    chmod +x /app/anubis && \
    curl --fail --location --proto '=https' --tlsv1.2 \
      "https://github.com/oauth2-proxy/oauth2-proxy/releases/download/v7.15.3/oauth2-proxy-v7.15.3.linux-${TARGETARCH}.tar.gz" \
      --output "/tmp/oauth2-proxy-v7.15.3.linux-${TARGETARCH}.tar.gz" && \
    echo "${OAUTH2_PROXY_SHA256}  /tmp/oauth2-proxy-v7.15.3.linux-${TARGETARCH}.tar.gz" | sha256sum --check --strict - && \
    tar -xzf "/tmp/oauth2-proxy-v7.15.3.linux-${TARGETARCH}.tar.gz" -C /app --strip-components=1 "oauth2-proxy-v7.15.3.linux-${TARGETARCH}/oauth2-proxy" && \
    rm "/tmp/oauth2-proxy-v7.15.3.linux-${TARGETARCH}.tar.gz" && \
    chmod +x /app/oauth2-proxy && \
    yarn install --immutable && \
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
ARG BUILD_VERSION
ARG VCS_REF
ENV NODE_ENV=production
LABEL org.opencontainers.image.source="https://github.com/shedowe19/ShieldPM" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}"
COPY scripts/setup-node-apt.sh /usr/local/bin/setup-node-apt.sh
RUN bash /usr/local/bin/setup-node-apt.sh && \
    apt-get install -y --no-install-recommends nodejs && \
    node --version | grep -E '^v24\.' && \
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
HEALTHCHECK CMD ["healthcheck.sh"]
