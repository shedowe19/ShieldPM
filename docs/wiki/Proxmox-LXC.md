# Proxmox LXC Installation

ShieldPM provides pre-built, systemd-ready **LXC Templates** for Proxmox VE. These templates allow you to run ShieldPM comfortably in a Linux Container (LXC) instead of a Docker machine, saving resources and reducing overhead.

> [!IMPORTANT]
> **Proxmox Requirements**
>
> - Proxmox VE 7.4 or newer
> - Architecture: `amd64` (x86_64) or `arm64` (Raspberry Pi/Ampere)

---

## Method 1: Pre-built LXC Template (App Only)

This is the **fastest** method but requires an **External Database** (MySQL/PostgreSQL) or existing SQLite. The template contains ONLY the application (Node.js + Nginx).

## Method 2: Native Installer (All-in-One)

If you want a **Monolithic** setup with a local Database (MariaDB/PostgreSQL) inside the container:

1.  Create a standard **Debian 13 (Trixie)** LXC container.
2.  Follow the [Native Installer Guide](Installation).
    - Checks `Root Runner` automatically.
    - Installs Database Server locally.
    - Sets up Systemd & Nginx.

---

## 1. Download Template (Method 1)

1.  Go to the **[Releases](https://github.com/shedowe19/ShieldPM/releases)** page.
2.  Download the latest template file from [GitHub Releases](https://github.com/shedowe19/ShieldPM/releases) (for example, `shieldpm-lxc-template-amd64.tar.gz` or the current release-specific template name).
3.  Upload to Proxmox **CT Templates**.

---

## 2. Create Container (CT)

In Proxmox Web UI:

1.  Click **Create CT**.
2.  **General:**
    - **Hostname:** `shieldpm`
    - **Unprivileged:** Checked ✅ (Recommended)
      > **Note:** If you want to use `NGINX_QUIC_BPF=true`, you **must** use a **Privileged** container, as BPF is not available in unprivileged LXC.
    - **Nesting:** Checked ✅ (Required for Systemd)
3.  **Template:** Select the `shieldpm-...tar.gz` you uploaded.
4.  **Disks:** 8GB (minimum)
5.  **CPU/Memory:** 2 Cores, 2048MB RAM (minimum recommended).
6.  **Network:** Config static IP or DHCP.
7.  **Confirm** & Start.

> [!NOTE]
> The container is pre-patched with `systemd`, `qemu-guest-agent`, and all necessary network tools. It behaves like a full VM but with container efficiency.

---

## 3. Configuration

ShieldPM in LXC does NOT use `compose.yaml`. Instead, it reads a single `.env` file.

1.  **Open Shell** (Console) of the container.
2.  Edit the configuration:
    ```bash
    nano /data/.env
    ```
3.  **Uncomment and Set** your variables (e.g., `TZ`, `DB_MYSQL_...`, `ACME_EMAIL`).
4.  **Restart** the container or service:
    ```bash
    systemctl restart shieldpm
    ```

### Available Drives / Mounts

You can bind-mount storage from Proxmox into the container (e.g. for `/data`).
Edit `/etc/pve/lxc/100.conf` on the **Proxmox Host**:

```bash
mp0: /mnt/pve/data/shieldpm,mp=/data
```

### 🗄️ External Database (MySQL/PostgreSQL)

If you want to use **MySQL** or **PostgreSQL** (instead of the default SQLite):

> [!WARNING]
> The LXC container **ONLY** contains the ShieldPM application (Nginx + Node.js).
> It does **NOT** include any optional sidecar containers defined in `compose.yaml`, such as:
>
> - **Database** (MySQL / PostgreSQL — can be installed natively via the [Native Installer](Installation))
> - **CrowdSec** (can be installed natively — see [CrowdSec Guide](CrowdSec))
> - **OpenAppSec** (can be installed natively — see [OpenAppSec Guide](OpenAppSec))
> - **GeoIP Update** (can be installed natively via the [Native Installer](Installation))
>
> You must install/host these services yourself (e.g., in another LXC container, VM, or managed service) if you require them.

1.  Enable `DB_MYSQL_` or `DB_POSTGRES_` variables in `/data/.env`.
2.  Ensure the container can reach your database IP.
3.  Create the empty database and user manually before starting ShieldPM.

---

## 4. Updates

Updating is fully integrated inside the container! You do **not** need to destroy and recreate the CT.

Simply run:

```bash
update
```

This command will:

1.  Fetch the latest source code.
2.  Rebuild the Frontend & Backend locally.
3.  **Update Application:** Replaces Frontend & Backend files.
4.  **Update System:** Syncs new scripts and configs (Rootfs/Systemd/Tor) to `/`.
5.  **Update Nginx (Optional):** Downloads pre-compiled Nginx, Certbot & Cloudflared binaries from GitHub Releases.
6.  Restart the service.

> [!TIP]
> The Nginx binary update saves you from compiling Nginx locally, which can take 30+ minutes. The pre-built binaries are identical to those used in the Docker image.

---

## 5. Supported Features (LXC)

| Feature        | Status | Notes                                     |
| :------------- | :----: | :---------------------------------------- |
| **Systemd**    |   ✅   | Works out of the box (requires Nesting)   |
| **QEMU Agent** |   ✅   | IP display & graceful shutdown works      |
| **Nesting**    |   ✅   | Supported                                 |
| **NFS / SMB**  |   ✅   | `nfs-common` & `cifs-utils` pre-installed |
| **FUSE**       |   ✅   | `fuse3` pre-installed                     |
| **Auto-Start** |   ✅   | `shieldpm.service` enabled by default     |
