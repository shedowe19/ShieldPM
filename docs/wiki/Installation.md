# Installation

ShieldPM offers three deployment methods to suit your environment:
1.  **🐳 Docker (Recommended):** Best for most users. Easy updates, isolated environment.
2.  **📦 Native Installer:** Best for bare-metal Debian 13 (Trixie) servers.
3.  **🖥️ Proxmox LXC:** Best for Proxmox users (pre-configured container template).

---

## 1. 🐳 Docker (Recommended)

Requires Docker Engine and Docker Compose.

### Quick Start
1.  **Create a `compose.yaml` file:**
    ```yaml
    services:
      app:
        image: 'ghcr.io/shedowe19/shieldpm:latest'
        restart: unless-stopped
        ports:
          - '80:80'
          - '81:81'
          - '443:443'
        volumes:
          - ./data:/data
          - ./letsencrypt:/etc/letsencrypt
    ```

2.  **Start ShieldPM:**
    ```bash
    docker compose up -d
    ```

3.  **Access the Admin Panel:**
    Open `http://<your-ip>:81` in your browser.
    - **Email:** `admin@example.com`
    - **Password:** `changeme`

### Updating (Docker)
 simply pull the latest image and recreate the container:
```bash
docker compose pull
docker compose up -d
```

---

## 2. 📦 Native Installer (Debian 13 / Trixie)

This method installs ShieldPM directly onto a fresh Debian 13 system. It includes pre-compiled Nginx binaries with all modules (HTTP/3, ModSecurity, etc.), so **no compilation is required**.

### Prerequisites
- **OS:** Debian 13 (Trixie) - Fresh Install recommended.
- **Root Access**

### Installation
1.  **Download the Installer:**
    Get the latest `shieldpm-install-linux-<arch>.tar.gz` from [GitHub Releases](https://github.com/shedowe19/ShieldPM/releases).
    
    *Example (for AMD64):*
    ```bash
    wget https://github.com/shedowe19/ShieldPM/releases/latest/download/shieldpm-install-linux-amd64.tar.gz
    ```

2.  **Extract and Run:**
    ```bash
    tar -xzf shieldpm-install-linux-amd64.tar.gz
    sudo ./install.sh
    ```

3.  **Access:**
    Open `http://<your-ip>:81`.

### Updating (Native)
ShieldPM includes a self-updating utility. Run:
```bash
update-shieldpm
# OR simply
update
```
This command will:
1.  Check GitHub for updates.
2.  Upgrade system packages (`apt upgrade`).
3.  Update ShieldPM code.
4.  (Optional) Update Nginx binaries.

---

## 3. 🖥️ Proxmox LXC

For Proxmox users, we provide a pre-built LXC template based on Debian 13.

### Installation
1.  **Download Template:**
    Get `shieldpm-lxc-template-<arch>.tar.gz` from [GitHub Releases](https://github.com/shedowe19/ShieldPM/releases).
2.  **Upload to Proxmox:**
    Go to `local (pve) > CT Templates > Upload`.
3.  **Create CT:**
    Create a new container using this template.
4.  **Important Setting:**
    In the container **Options**, enable **Nesting**.
5.  **Start:**
    Boot the container. ShieldPM allows access via `http://<IP>:81` immediately.

### Updating (LXC)
Open the container console and run:
```bash
update
```

> [!WARNING]
> The **HTTP/3 BPF** feature (`NGINX_QUIC_BPF=true`) requires a **Privileged Container**. It is disabled by default and not available in unprivileged containers.

---

## ⚙️ Configuration (Environment Variables)

ShieldPM is configured via environment variables. In Docker, set them in `compose.yaml`. In Native/LXC, edit `/data/.env`.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `DB_SQLITE_FILE` | `/data/database.sqlite` | SQLite database path |
| `DB_MYSQL_HOST` | - | MySQL Host (switches to MySQL if set) |
| `DB_POSTGRES_HOST` | - | PostgreSQL Host (switches to PG if set) |
| `DISABLE_IPV6` | `false` | Disable IPv6 in Nginx |
| `LOG_LEVEL` | `info` | API Log Level |
