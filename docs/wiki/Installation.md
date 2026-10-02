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
     shieldpm:
       image: "ghcr.io/shedowe19/shieldpm:develop"
       restart: unless-stopped
       ports:
         - "80:80"
         - "81:81"
         - "443:443"
         - "443:443/udp" # HTTP/3 (QUIC)
       environment:
         TZ: Europe/Berlin # Required; choose your local IANA time zone
       volumes:
         - ./data:/data
   ```

2. **Start ShieldPM:**

   ```bash
   docker compose up -d
   ```

3. **Access the Admin Panel:**
   Open `https://<your-ip>:81` in your browser (self-signed certificate — accept the browser warning).
   The **Setup Wizard** will guide you through creating your admin account.

> [!TIP]
> There are no default credentials — you create your own admin user during the initial setup.

### Updating (Docker)

Simply pull the latest image and recreate the container:

```bash
docker compose pull
docker compose up -d
```

> [!TIP]
> Your data, including certificates, is stored in the mounted `/data` volume. Pulling a new image and recreating the container does **not** delete it. If you selected MySQL or PostgreSQL, back up that database separately.

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
   ```

2. **Extract and Run:**

   ```bash
   tar -xzf shieldpm-install-linux-amd64.tar.gz
   sudo ./install.sh
   ```

3. **Access:**
   Open `https://<your-ip>:81`. The Setup Wizard will guide you through creating your admin account.

### Updating (Native)

ShieldPM includes a self-updating utility. Run:

```bash
sudo update-shieldpm
```

This command will:

1. Check GitHub for updates and self-update the updater first.
2. Upgrade system packages (`apt upgrade`), migrate to Node.js 26 and install Yarn Classic 1.22.22.
3. Rebuild and replace the application from its committed lockfiles while preserving `/data`.
4. Offer updates for installed Nginx, Anubis and OAuth2 Proxy binaries.
5. Restart or start ShieldPM, apply pending database migrations and verify the backend health endpoint before reporting success.

Run `update-shieldpm` with root privileges on native installations. Back up `/data` and any external database before upgrading.

---

## 3. 🖥️ Proxmox LXC

For Proxmox users, we provide a pre-built LXC template based on Debian 13.

### Installation

1. **Download Template:**
   Get `shieldpm-develop-lxc_<arch>.tar.gz` (for example, `shieldpm-develop-lxc_amd64.tar.gz`) from [GitHub Releases](https://github.com/shedowe19/ShieldPM/releases).
2. **Upload to Proxmox:**
   Go to `local (pve) > CT Templates > Upload`.
3. **Create CT:**
   Create a new container using this template. SQLite works without an additional database; MariaDB and PostgreSQL require separate setup.
4. **Important Setting:**
   In the container **Options**, enable **Nesting**.
5. **Start:**
   Boot the container. Access `https://<IP>:81` — the Setup Wizard will create your admin account.

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
3. **[Enable Let's Encrypt](SSL-Certificates)** — Review Settings → Certificates / ACME, then configure your domain and certificate request
4. **[Enable CrowdSec](CrowdSec)** — Protect against brute force and malicious bots
5. **[Review Best Practices](Best-Practices)** — Security hardening and performance tips

---

[🏠 Home](Home) | [📖 Configuration Reference](Configuration) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
