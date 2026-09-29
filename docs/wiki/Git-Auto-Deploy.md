# Git Auto-Deploy

ShieldPM allows you to automatically deploy and update static websites or applications directly from a Git repository. This feature is designed for **Path-based Proxy Hosts**, making it ideal for hosting static sites, documentation (like MKDocs), or simple PHP applications.

## 🚀 Features

- **Auto-Sync**: Automatically pulls changes from your remote repository.
- **Polling**: Configurable check interval (Seconds, Minutes, Hours).
- **Secure**: Supports private repositories with encrypted credentials (PAT/Password).
- **Webroot Update**: The first successful clone sets the host's document root and triggers an Nginx config validation/reload. Subsequent pulls update files in that directory; a changed branch or repository is cloned into a temporary directory before replacing the checkout.

---

## ⚙️ Configuration

To enable Git Auto-Deploy, create or edit a **Proxy Host**.

1.  **Tab "Details"**: Set **Forward Scheme** to **`path`**.
2.  **Tab "Git Sync"** (New tab appears):
    - **Repository URL**: `https://github.com/username/repo.git`
    - **Branch**: `main` (Default)
    - **Credentials**: Optional. Use a **Personal Access Token (PAT)** for GitHub/GitLab private repos.
    - **Auto Sync**: Enable to start the polling service.
    - **Interval**: Set how often ShieldPM checks for updates (min. **10s**).

### 🔐 Authentication

ShieldPM encrypts your Git credentials using **AES-256-GCM** before storing them in the database.

- **Public Repos**: Leave credentials empty.
- **Private Repos**: Enter an HTTPS Personal Access Token. The Git service uses `git` as the HTTP username and the stored credential as the password; it does not use a separately entered username or native SSH Git transport.

> [!TIP]
> For GitHub, use a fine-grained **Personal Access Token (PAT)** with **Read-Only** access to the repository contents.

---

## 📂 File Structure

Repositories are cloned to:
`/data/websites/host-{id}/`

The `forward_host` path in your Proxy Host config is automatically updated to point to this directory.

---

## 🛠️ Usage Examples

### Static Website (HTML/JS)

1.  Create Proxy Host (`example.com`).
2.  Scheme: `path`.
3.  Git Repo: `https://github.com/my/website.git`.
4.  Save.
5.  ShieldPM clones the repo -> Website is live.

### PHP Application

1.  Enable **PHP Support** in the "Details" tab.
2.  Select PHP Version (e.g., 8.3).
3.  Configure Git Sync as above.
4.  ShieldPM serves your PHP app from the cloned repository.

---

## ❓ Troubleshooting

### "Sync Failed" Status

Hover over the error icon in the Git Sync tab to see the detailed error message. Common causes:

- **Authentication**: Invalid Token/Password.
- **Branch**: The specified branch (`main`/`master`) does not exist.
- **Network**: ShieldPM cannot reach the Git server (DNS/Firewall).

### Logs

Check the application's backend logs for detailed sync information:

```bash
# Docker
docker logs -f shieldpm 2>&1 | grep "git-deploy"

# Native / LXC
journalctl -u shieldpm -f | grep "git-deploy"
```

Git Auto-Deploy is disabled in `DEMO_MODE=true`. The target site must have a **Path** scheme and a reachable HTTPS repository URL.
