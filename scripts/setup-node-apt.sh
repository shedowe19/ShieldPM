#!/bin/bash

# NodeSource APT repository setup for Node.js 26.
# Derived from the user-provided NodeSource setup_26.x script and committed so
# Docker builds do not fetch or execute a mutable remote setup script.

log() {
  local message="$1"
  local type="$2"
  local timestamp
  local color
  local endcolor="\033[0m"

  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  case "$type" in
    "info") color="\033[38;5;79m" ;;
    "success") color="\033[1;32m" ;;
    "error") color="\033[1;31m" ;;
    *) color="\033[1;34m" ;;
  esac

  echo -e "${color}${timestamp} - ${message}${endcolor}"
}

handle_error() {
  local exit_code=$1
  local error_message="$2"

  log "Error: $error_message (Exit Code: $exit_code)" "error"
  exit "$exit_code"
}

check_os() {
  if ! [ -f "/etc/debian_version" ]; then
    handle_error 1 "This script is only supported on Debian-based systems."
  fi
}

install_pre_reqs() {
  log "Installing NodeSource repository prerequisites" "info"

  apt-get update -y || handle_error "$?" "Failed to run apt-get update"
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg || handle_error "$?" "Failed to install repository prerequisites"

  install -d -m 0755 /usr/share/keyrings || handle_error "$?" "Failed to create /usr/share/keyrings"
  rm -f /usr/share/keyrings/nodesource.gpg /etc/apt/sources.list.d/nodesource.list /etc/apt/sources.list.d/nodesource.sources

  local nodesource_key_fingerprint="6F71F525282841EEDAF851B42F59B5F99B1BE0B4"
  local actual_fingerprint

  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | \
    gpg --dearmor --yes --output /usr/share/keyrings/nodesource.gpg || \
    handle_error "$?" "Failed to download and import the NodeSource signing key"
  actual_fingerprint=$(gpg --show-keys --with-colons /usr/share/keyrings/nodesource.gpg | awk -F: '$1 == "fpr" { print $10; exit }') || \
    handle_error "$?" "Failed to inspect the NodeSource signing key"
  if [ "$actual_fingerprint" != "$nodesource_key_fingerprint" ]; then
    handle_error 1 "NodeSource signing key fingerprint did not match the pinned value"
  fi
  chmod 0644 /usr/share/keyrings/nodesource.gpg || handle_error "$?" "Failed to set NodeSource key permissions"
}

configure_repo() {
  local node_version=$1
  local arch

  arch=$(dpkg --print-architecture)
  if [ "$arch" != "amd64" ] && [ "$arch" != "arm64" ]; then
    handle_error 1 "Unsupported architecture: $arch. Only amd64 and arm64 are supported."
  fi

  cat > /etc/apt/sources.list.d/nodesource.sources <<EOF
Types: deb
URIs: https://deb.nodesource.com/node_$node_version
Suites: nodistro
Components: main
Architectures: $arch
Signed-By: /usr/share/keyrings/nodesource.gpg
EOF

  cat > /etc/apt/preferences.d/nsolid <<'EOF'
Package: nsolid
Pin: origin deb.nodesource.com
Pin-Priority: 600
EOF

  cat > /etc/apt/preferences.d/nodejs <<'EOF'
Package: nodejs
Pin: origin deb.nodesource.com
Pin-Priority: 600
EOF

  apt-get update -y || handle_error "$?" "Failed to update the NodeSource package index"
  log "NodeSource Node.js $node_version repository configured successfully" "success"
}

NODE_VERSION="26.x"
check_os
install_pre_reqs
configure_repo "$NODE_VERSION"
