# GitOps Synchronization

GitOps is a powerful feature that allows you to backup, version control, and restore your ShieldPM configuration using Git.

## Overview

The GitOps feature enables:

- **Configuration Export**: Export Proxy Hosts and monitors, Redirection/Dead Hosts, Streams, Access Lists, certificates (without exported private-key files), DDNS providers, tunnels, users and settings as YAML/files
- **Version Control**: Every change is committed with full Git history
- **Configuration Recovery**: Import YAML or revert to a previous commit; keep separate `/data` and database backups for a full recovery
- **Infrastructure as Code**: Store your configuration alongside your other IaC files

## 🏗️ Architecture

```
  ┌──────────────────┐      ┌───────────────────┐      ┌──────────────────┐
  │   ShieldPM UI    │─────▶│  ShieldPM Backend  │─────▶│  Git Repository  │
  │  Export / Import │      │                    │      │  (GitHub/GitLab) │
  └──────────────────┘      │  ┌──────────────┐ │      └──────────────────┘
                            │  │   Database    │ │             ▲
                            │  │  (Source of   │ │             │
                            │  │   Truth)      │ │             │
                            │  └──────┬───────┘ │      ┌──────┴──────┐
                            │         │         │      │ isomorphic- │
                            │         ▼         │      │    git      │
                            │  ┌──────────────┐ │      │ (commit,    │
                            │  │ YAML Export  │─┼──────▶  push, pull)│
                            │  │ Engine       │ │      └─────────────┘
                            │  └──────────────┘ │
                            └───────────────────┘

  Auto-Push Flow:
  ┌──────────┐      ┌────────────┐      ┌──────────┐      ┌──────────┐
  │ Host     │─────▶│ Export     │─────▶│ git      │─────▶│ Remote   │
  │ Changed  │      │ to YAML   │      │ commit   │      │ Push     │
  └──────────┘      └────────────┘      └──────────┘      └──────────┘
      (debounced 5s)
```

**Key Points:**

- The database is the **source of truth** — YAML files are derived from it
- Auto-push is debounced (5s) to avoid excessive commits during bulk operations
- Credentials (PAT) are encrypted with **AES-256-GCM** before storage
- Import can optionally **overwrite** existing records and reconcile deletions; review the repository content before importing

## Configuration

Navigate to **Settings → GitOps** to configure the feature.

### Repository Settings

| Setting                 | Description                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Repository URL**      | HTTPS URL of your Git repository (e.g., `https://github.com/user/shieldpm-backup.git`)                       |
| **Branch**              | Target branch (default: `main`)                                                                              |
| **Authentication Type** | HTTPS with a Personal Access Token. The backend's `ssh` setting does not implement native SSH Git transport. |
| **Credentials**         | Your Personal Access Token (PAT) for GitHub/GitLab/etc.                                                      |

### Automation Options

| Option                   | Description                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Auto-Push on Changes** | Automatically export and push when configuration changes (debounced 5s)                                        |
| **Auto-Pull on Startup** | Pulls remote files into `/data/gitops` on startup; it does **not** automatically import them into the database |

## Usage

### Test Connection

Click **Test Connection** to verify that ShieldPM can access your repository. This validates the URL and credentials.

### Export & Push

Click **Export & Push** to:

1. Export the supported configuration records and public certificate files to `/data/gitops/shieldpm-config/`
2. Stage and commit all changes
3. Push to the remote repository

### Pull Now

Click **Pull Now** to fetch the latest changes from the remote repository. This updates the local Git repository but does **not** automatically import the configuration.

### Import from Git

Click **Import from Git** to import configuration from the YAML files into the database.

> [!WARNING]
> This can overwrite existing hosts if **Overwrite** is enabled. Use with caution.

### Commit History

The history section shows recent commits with:

- Commit SHA
- Commit message
- Author
- Date

You can **Revert** to a previous commit; this checks out that commit, imports it with overwrite enabled, and schedules a backend restart after a successful import. Back up your current state before reverting.

## Repository Structure

ShieldPM creates the following directory structure in your repository:

```
shieldpm-config/
├── proxy-hosts/
│   ├── 1-example-com.yaml
│   └── 2-api-example-com.yaml
├── proxy-host-monitors/
│   └── 1.yaml
├── redirection-hosts/
│   └── 1-old-domain.yaml
├── streams/
│   └── 1-ssh-tunnel.yaml
├── dead-hosts/
│   └── 1-blocked-domain.yaml
├── access-lists/
│   ├── 1.yaml
│   └── 2.yaml
├── certificates/
│   ├── 1-example-com.yaml
│   └── 2-wildcard.yaml
├── cloudflared-tunnels/
│   └── 1.yaml
├── ddns-providers/
│   └── 1.yaml
├── users/
│   ├── 1-admin.yaml
│   └── 2-user.yaml
├── settings/
│   ├── default-site.yaml
│   └── ai-config.yaml
└── certificate-files/
    ├── letsencrypt/
    │   └── npm-1/
    │       ├── fullchain.pem
    │       ├── cert.pem
    │       └── chain.pem
    └── custom/
        └── npm-1/
            └── fullchain.pem
```

### What is Exported

| Data Type               | Includes                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Proxy Hosts**         | Host fields, including potentially sensitive metadata and configured integration credentials                                 |
| **Proxy Host Monitors** | Monitor configuration; not transient check history                                                                           |
| **Redirection Hosts**   | All fields                                                                                                                   |
| **Dead Hosts**          | All fields                                                                                                                   |
| **Streams**             | All fields                                                                                                                   |
| **Access Lists**        | Items (with hashed passwords), clients, mTLS config                                                                          |
| **Certificates**        | Database entries with meta, provider, domain names                                                                           |
| **Certificate Files**   | Public Let's Encrypt, custom and internal CA/leaf certificate files; files named `privkey.pem` or ending `.key` are excluded |
| **Cloudflared Tunnels** | Tunnel name, token, status, meta                                                                                             |
| **DDNS Providers**      | Provider configuration, which may include API tokens                                                                         |
| **Users**               | User data with permissions (no auth credentials)                                                                             |
| **Settings**            | All settings except GitOps config                                                                                            |

> [!WARNING]
> The YAML export can include Access List password hashes and plaintext service credentials, including DDNS provider config tokens and Cloudflared tunnel tokens. It excludes private-key **files**, but does not scrub every secret from YAML fields. **Use a private repository with limited access** and treat the local `/data/gitops/` checkout as sensitive.

### YAML File Example

```yaml
# proxy-hosts/1-example-com.yaml
id: 1
owner_user_id: 1
domain_names:
  - example.com
  - www.example.com
forward_scheme: http
forward_host: 192.168.1.100
forward_port: 8080
ssl_forced: true
block_exploits: true
allow_websocket_upgrade: true
http2_support: true
enabled: true
access_list_id: 0
certificate_id: 1
advanced_config: ""
meta: {}
locations: []
created_on: "2026-01-15T10:00:00.000Z"
modified_on: "2026-01-18T00:30:00.000Z"
```

## Security

### Credential Encryption

Your Git credentials (Personal Access Token) are encrypted using **AES-256-GCM** before being stored in the database. Keep `/data/shieldpm/keys.json` backed up with your database so encrypted credentials remain usable after restore. The GitOps export excludes the GitOps configuration setting.

### Private Repositories

Always use **private repositories** for your configuration backups. The export includes:

- Internal hostnames and IP addresses
- Hashed passwords for Basic Auth
- Service credentials in exported YAML (for example, DDNS provider and Cloudflared tokens)
- User email addresses

Certificate private-key **files** are not exported or restored. Restore `/data/tls/` from a separate protected backup before relying on restored certificates.

## Creating a Personal Access Token

### GitHub

Create a repository-scoped token with the minimum contents read/write permissions required by your Git provider, and paste it into ShieldPM's GitOps settings. Use a private repository.

### GitLab

Create a token with repository read/write access for the private repository and paste it into ShieldPM's GitOps settings.

## Demo Mode

GitOps write actions (configuration changes, test/export/push/pull/import/revert) are **disabled in Demo Mode**. Authorized read endpoints for configuration/history may still respond; the UI disables GitOps editing.

## Troubleshooting

### "Connection failed"

- Verify the repository URL is correct
- Ensure the PAT has the required permissions (`repo` scope)
- Check if the repository exists and you have push access

### "No changes to commit"

This message appears when the exported configuration is identical to the last commit. This is normal behavior.

### "Could not get history"

This occurs when the Git repository has no commits yet. Push at least once to create the initial commit.

---

[🏠 Home](Home) | [🔒 Security](Security) | [⚙️ Settings](Configuration)
