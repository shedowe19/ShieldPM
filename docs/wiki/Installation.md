# Installation

ShieldPM is designed to be deployed using **Docker Compose**.

## Prerequisites
*   Docker Engine
*   Docker Compose

## 🚀 Quick Start

1.  **Download the Compose File:**
    ```bash
    curl -o compose.yaml https://raw.githubusercontent.com/shedowe19/ShieldPM/refs/heads/develop/compose.yaml
    ```

2.  **Configure Environment:**
    Open `compose.yaml` and adjust:
    *   `TZ`: Your Timezone (e.g., `Europe/Berlin`).
    *   `ACME_EMAIL`: Email for Let's Encrypt notifications.

3.  **Start the Container:**
    ```bash
    docker compose up -d
    ```

4.  **Access the Admin Interface:**
    *   **URL:** `https://<your-server-ip>:81`
    *   **Default Email:** `admin@example.org`
    *   **Default Password:** Check the logs for the unique initial password:
        ```bash
        docker logs shieldpm
        ```

---

## 📦 Migration from Original NPM

> [!IMPORTANT]
> **Backup Required:** Migration is one-way. You cannot downgrade back to the original NPM easily. Always create a backup first!

1.  **Backup Data:**
    Backup your existing `/data` and `/etc/letsencrypt` directories.

2.  **Stop Old Container:**
    ```bash
    docker stop nginx-proxy-manager
    ```

3.  **Deploy ShieldPM:**
    Update your `docker-compose.yml` to use `ghcr.io/shedowe19/shieldpm:latest` and point the volumes to your existing data.

4.  **Cleanup:**
    After the first successful start, the `/etc/letsencrypt` volume is no longer needed (certs are moved to `/data`). You can verify this and remove the volume mapping.

5.  **Verify:**
    Log in and check your hosts. If you are proxying ShieldPM through itself, ensure the scheme is set to **HTTPS**.

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
