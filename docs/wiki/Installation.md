# Installation

ShieldPM supports Docker, Native Debian 13 (Trixie), and Proxmox LXC deployments.

The current repository `develop` branch uses:

- Image: `ghcr.io/shedowe19/shieldpm:develop`
- Default runtime mode: `network_mode: host`
- Data directory: `/opt/shieldpm` on the host mounted to `/data` in the container
- UI port: `81` by default (`NPM_PORT`)

For release deployments you may choose a tagged image or `ghcr.io/shedowe19/shieldpm:latest`, but the examples below match the current repository files.

| Method                  | Best For                                | Update Method                                 |
| :---------------------- | :-------------------------------------- | :-------------------------------------------- |
| 🐳 **Docker**           | Most users; isolated and easy to update | `docker compose pull && docker compose up -d` |
| 📦 **Native Installer** | Fresh Debian 13 / Trixie servers        | `update-shieldpm` or `update`                 |
| 🖥️ **Proxmox LXC**      | Proxmox containers with systemd         | `update` inside the container                 |

---

## 1. 🐳 Docker Quick Start

### Easy compose file

Download the current easy compose file from the `develop` branch:

```bash
curl -fsSL -o compose.yaml https://raw.githubusercontent.com/shedowe19/ShieldPM/refs/heads/develop/compose.easy.yaml
```

Review at least:

- `TZ`
- exposed host ports (`NPM_PORT`, `HTTP_PORT`, `HTTPS_PORT`)
- data path (`/opt/shieldpm:/data`)
- optional `CSRF_SECRET`

Start ShieldPM:

```bash
docker compose up -d
```

Open the UI:

```text
http://<your-ip>:81
```

The setup wizard creates the first admin user unless you explicitly set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`.

### Full compose file

For all optional services and feature toggles:

```bash
curl -fsSL -o compose.yaml https://raw.githubusercontent.com/shedowe19/ShieldPM/refs/heads/develop/compose.yaml
```

See [Docker Compose Reference](Docker-Compose-Reference) for the exact current file.

### Docker update

```bash
docker compose pull
docker compose up -d
```

Data in `/data` is persistent and is not deleted by recreating the container.

---

## 2. 📦 Native Installer (Debian 13 / Trixie)

Native installation targets fresh Debian 13 systems and installs ShieldPM directly on the host, including service files and required runtime dependencies.

### Requirements

- Debian 13 (Trixie), fresh install recommended
- Root access
- Internet access for package and release downloads

### Install

Download the latest installer archive from GitHub Releases:

```bash
wget https://github.com/shedowe19/ShieldPM/releases/latest/download/shieldpm-install-linux-amd64.tar.gz
tar -xzf shieldpm-install-linux-amd64.tar.gz
sudo ./install.sh
```

Then open:

```text
http://<your-ip>:81
```

### Native update

```bash
update-shieldpm
# or
update
```

The updater refreshes system packages, ShieldPM files, and optional Nginx/runtime components according to the installed deployment mode.

---

## 3. 🖥️ Proxmox LXC

For Proxmox, use the latest ShieldPM LXC template from GitHub Releases or create a fresh Debian 13 container and run the native installer.

Important LXC settings:

- Enable **Nesting**.
- For WireGuard, `/dev/net/tun` and `NET_ADMIN`/routing support may be required.
- For QUIC BPF (`NGINX_QUIC_BPF=true`), privileged/container capability support is required.

Update inside the container:

```bash
update
```

---

## Next Steps

1. [Configuration](Configuration) — Review all current environment variables.
2. [Docker Compose Reference](Docker-Compose-Reference) — Use the full compose reference for optional services.
3. [Proxy Hosts](Proxy-Hosts) — Create your first proxy host.
4. [SSL Certificates](SSL-Certificates) — Configure ACME/Let's Encrypt or custom certs.
5. [Best Practices](Best-Practices) — Harden access and backups.

---

[🏠 Home](Home) | [📖 Configuration Reference](Configuration) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
