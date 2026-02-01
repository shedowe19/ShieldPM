# Proxmox LXC Installation

ShieldPM provides pre-built, systemd-ready **LXC Templates** for Proxmox VE. These templates allow you to run ShieldPM comfortably in a Linux Container (LXC) instead of a Docker machine, saving resources and reducing overhead.

> [!IMPORTANT]
> **Proxmox Requirements**
> *   Proxmox VE 7.4 or newer
> *   Architecture: `amd64` (x86_64) or `arm64` (Raspberry Pi/Ampere)

---

## 1. Download Template

1.  Go to the **[Releases](https://github.com/shedowe19/ShieldPM/releases)** page on GitHub.
2.  Download the latest template file:
    *   **Intel/AMD:** `shieldpm-x.x.x-lxc_amd64.tar.gz`
    *   **ARM:** `shieldpm-x.x.x-lxc_arm64.tar.gz`
3.  Upload the file to your Proxmox storage (e.g., `local`) under **CT Templates**.

---

## 2. Create Container (CT)

In Proxmox Web UI:

1.  Click **Create CT**.
2.  **General:**
    *   **Hostname:** `shieldpm`
    *   **Unprivileged:** Checked ✅ (Recommended)
    *   **Nesting:** Checked ✅ (Required for Systemd)
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
> *   **Database** (MySQL / PostgreSQL)
> *   **CrowdSec**
> *   **OpenAppSec** (WAF Agents)
> *   **GeoIP Update**
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
3.  Replace the running files.
4.  Restart the service.

---

## 5. Supported Features (LXC)

| Feature | Status | Notes |
| :--- | :--: | :--- |
| **Systemd** | ✅ | Works out of the box (requires Nesting) |
| **QEMU Agent** | ✅ | IP display & graceful shutdown works |
| **Nesting** | ✅ | Supported |
| **NFS / SMB** | ✅ | `nfs-common` & `cifs-utils` pre-installed |
| **FUSE** | ✅ | `fuse3` pre-installed |
| **Auto-Start** | ✅ | `shieldpm.service` enabled by default |
