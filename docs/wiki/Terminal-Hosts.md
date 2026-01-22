# Terminal Hosts

ShieldPM allows you to manage **Terminal Hosts**, which act as an SSH Bastion or Web-based Terminal Gateway. This allows you to access your servers directly from the browser using a secure, authenticated WebSocket connection.

## 🚀 Key Features

*   **Web Terminal:** Full xterm.js implementation in the browser.
*   **SSH Bastion:** Connects to backend servers via SSH.
*   **Secure Auth:** Supports both Password and SSH Key authentication (keys are encrypted at rest).
*   **Access Control:** Restrict terminal access to specific users.

## ⚙️ Configuration

To add a new Terminal Host:

1.  Go to **Nginx** > **Terminal Hosts**.
2.  Click **Add Terminal Host**.
3.  Fill in the details:
    *   **Name:** Friendly name for the host.
    *   **Hostname / IP:** The target server's address (e.g., `192.168.1.50`).
    *   **Port:** SSH port (default `22`).
    *   **Username:** SSH username (e.g., `root` or `ubuntu`).
    *   **Auth Method:**
        *   **Password:** Enter the user's password.
        *   **SSH Key:** Paste the **Private Key** (PEM format).

## 🔒 Security

*   **Encryption:** Passwords and Private Keys are encrypted in the database using the ShieldPM encryption key.
*   **WebSocket:** The terminal session uses a secure WebSocket (`wss://`) connection.
*   **Authentication:** Access to the terminal is protected by your ShieldPM login session. Only the owner or admins can access the terminal.

## 💻 Usage

Click the **Check Circle icon** (✅) or the **Terminal icon** in the list to open the Web Terminal modal.

> [!NOTE]
> The terminal session uses `xterm-256color` and supports resizing.

---
[🏠 Home](Home)
