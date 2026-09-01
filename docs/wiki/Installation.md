# Installation

ShieldPM offers three deployment methods to suit your environment:

| Method                      | Best For                                          | Update Method         |
| :-------------------------- | :------------------------------------------------ | :-------------------- |
| 🐳 **Docker** (Recommended) | Most users — easy updates, isolated environment   | `docker compose pull` |
| 📦 **Native Installer**     | Bare-metal Debian 13 (Trixie) servers             | `update-shieldpm`     |
| 🖥️ **Proxmox LXC**          | Proxmox users — pre-configured container template | `update`              |

---

## 1. 🐳 Docker (Recommended)

Requires Docker Engine and Docker Compose.

### Quick Start

1. **Create a `compose.yaml` file:**

   ```yaml
   services:
     app:
       image: "ghcr.io/shedowe19/shieldpm:latest"
       restart: unless-stopped
       ports:
         - "80:80"
         - "81:81"
         - "443:443"
       environment:
         TRUST_PROXY: "1"
       volumes:
         - ./data:/data
         - ./letsencrypt:/etc/letsencrypt
   ```

   `TRUST_PROXY=1` is required for the supported single Nginx-to-Express proxy hop inside the official image. The
   `/data` bind mount hides the image's bundled environment file, so Compose must set this value explicitly.

2. **Start ShieldPM:**

   ```bash
   docker compose up -d
   ```

3. **Access the Admin Panel:**
   Open `http://<your-ip>:81` in your browser.
   The **Setup Wizard** will guide you through claiming the instance and creating your admin account.

> [!TIP]
> There are no default credentials and no password is written to the logs. On first start ShieldPM writes a
> cryptographically random ownership token to `/data/shieldpm/initial-admin-setup-token` with mode `0600`.
> Read the file on the host/container and enter the token in the wizard. The API accepts it only through the
> `X-ShieldPM-Setup-Token` header and retires it atomically after the first administrator is created.

```bash
# Compose example: print the one-time token locally
docker compose exec app sh -c 'cat /data/shieldpm/initial-admin-setup-token'
```

> [!NOTE]
> Port 81 is HTTP by default. If the management UI crosses an untrusted network, put it behind a trusted TLS
> reverse proxy, tunnel or VPN and restrict direct access to port 81.

### Updating (Docker)

Simply pull the latest image and recreate the container:

```bash
docker compose pull
docker compose up -d
```

> [!TIP]
> Your data is stored in the mounted `/data` volume. Pulling a new image and recreating the container does **not** delete your configuration, certificates, or database.

---

## 2. 📦 Native Installer (Debian 13 / Trixie)

This method installs ShieldPM directly onto a fresh Debian 13 system. It includes pre-compiled Nginx binaries with all modules (HTTP/3, ModSecurity, etc.), so **no compilation is required**.

### Prerequisites

- **OS:** Debian 13 (Trixie) - Fresh Install recommended.
- **Root Access**

### Installation

1. **Download the Installer:**
   Get the latest `shieldpm-install-linux-<arch>.tar.gz` from [GitHub Releases](https://github.com/shedowe19/ShieldPM/releases).

   _Example (for AMD64):_

   ```bash
   wget https://github.com/shedowe19/ShieldPM/releases/latest/download/shieldpm-install-linux-amd64.tar.gz
   wget https://github.com/shedowe19/ShieldPM/releases/latest/download/shieldpm-install-linux-amd64.tar.gz.sha256
   sha256sum --check --strict shieldpm-install-linux-amd64.tar.gz.sha256
   ```

   For a stronger origin check, GitHub CLI users can additionally run
   `gh attestation verify shieldpm-install-linux-amd64.tar.gz --repo shedowe19/ShieldPM` before extraction.

2. **Extract and Run:**

   ```bash
   tar -xzf shieldpm-install-linux-amd64.tar.gz
   sudo ./install.sh
   ```

3. **Access:**
   Open `http://<your-ip>:81`. The Setup Wizard will guide you through creating your admin account.

### Updating (Native)

ShieldPM includes a transactional source updater. It deliberately does not modify the host toolchain. Run:

```bash
update-shieldpm
# OR simply
update
```

This command will:

1. Require the already installed Node.js 24, Corepack 0.36.0 and Yarn 4.18.0 toolchain exactly; it performs no APT,
   Node or package-manager upgrade.
2. Resolve the selected remote branch (`--branch`, default from the installation) to one exact 40-character commit SHA.
3. Create and verify an online SQLite backup. For MySQL/PostgreSQL it requires a tested native backup plus
   `--external-db-backup-confirmed`.
4. Build backend and frontend from immutable lockfiles in private staging directories while reusing the already
   verified native binaries.
5. Replace application, frontend, rootfs and service files transactionally while preserving `/data`; a failed
   120-second health gate restores files and SQLite automatically.
6. Keep ShieldPM stopped after a failed external-database update until the operator restores that database.

The updater refuses unsafe or unverifiable inputs. Keep an independent backup: application rollback cannot undo
an external MySQL/PostgreSQL schema or data change without an operator-provided database dump.

---

## 3. 🖥️ Proxmox LXC

For Proxmox users, we provide a pre-built LXC template based on Debian 13.

### Installation

1. **Download Template:**
   Get `shieldpm-lxc-template-<arch>.tar.gz` from [GitHub Releases](https://github.com/shedowe19/ShieldPM/releases).
2. **Upload to Proxmox:**
   Go to `local (pve) > CT Templates > Upload`.
3. **Create CT:**
   Create a new container using this template.
4. **Important Setting:**
   In the container **Options**, enable **Nesting**.
5. **Start:**
   Boot the container. Access `http://<IP>:81` — the Setup Wizard will create your admin account.

### Updating (LXC)

Open the container console and run:

```bash
update
```

> [!WARNING]
> The **HTTP/3 BPF** feature (`NGINX_QUIC_BPF=true`) requires a **Privileged Container**. It is disabled by default and not available in unprivileged containers.

> [!TIP]
> LXC containers use the same update mechanism as Native installations. Run `update` inside the container console to upgrade.

---

## ⚙️ Next Steps

After installation, you may want to:

1. **[Configure Environment Variables](Configuration)** — Customize ports, database, SSL, and more
2. **[Create Your First Proxy Host](Proxy-Hosts)** — Set up a reverse proxy for your first service
3. **[Enable Let's Encrypt](SSL-Certificates)** — Set `ACME_EMAIL` to enable automatic SSL
4. **[Enable CrowdSec](CrowdSec)** — Protect against brute force and malicious bots
5. **[Review Best Practices](Best-Practices)** — Security hardening and performance tips

---

[🏠 Home](Home) | [📖 Configuration Reference](Configuration) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
