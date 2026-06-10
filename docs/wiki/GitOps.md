# GitOps Synchronization

GitOps is a powerful feature that allows you to backup, version control, and restore your ShieldPM configuration using Git.

## Overview

The GitOps feature enables:

- **Configuration Backup**: Export all Proxy Hosts, Redirection Hosts, Dead Hosts, Streams, and Access Lists as YAML files
- **Version Control**: Every change is committed with full Git history
- **Disaster Recovery**: Restore configuration from any previous commit
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
- Import can optionally **overwrite** existing hosts

## Configuration

Navigate to **Settings → GitOps** to configure the feature.

### Repository Settings

| Setting                 | Description                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------- |
| **Repository URL**      | HTTPS URL of your Git repository (e.g., `https://github.com/user/shieldpm-backup.git`) |
| **Branch**              | Target branch (default: `main`)                                                        |
| **Authentication Type** | `HTTPS` (Personal Access Token) or `SSH` (not recommended, use PAT instead)            |
| **Credentials**         | Your Personal Access Token (PAT) for GitHub/GitLab/etc.                                |

### Automation Options

| Option                   | Description                                                             |
| ------------------------ | ----------------------------------------------------------------------- |
| **Auto-Push on Changes** | Automatically export and push when configuration changes (debounced 5s) |
| **Auto-Pull on Startup** | Automatically pull from remote when ShieldPM starts                     |

## Usage

### Test Connection

Click **Test Connection** to verify that ShieldPM can access your repository. This validates the URL and credentials.

### Export & Push

Click **Export & Push** to:

1. Export all hosts and access lists as YAML files
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

You can **Revert** to any previous commit to restore the YAML files to that state.

## Repository Structure

ShieldPM creates the following directory structure in your repository:

```
shieldpm-config/
├── proxy-hosts/
│   ├── 1-example-com.yaml
│   └── 2-api-example-com.yaml
├── redirection-hosts/
│   └── 1-old-domain.yaml
├── streams/
│   └── 1-ssh-tunnel.yaml
├── dead-hosts/
│   └── 1-blocked-domain.yaml
├── access-lists/
│   ├── 1-admin-only.yaml
│   └── 2-internal-network.yaml
├── certificates/
│   ├── 1-example-com.yaml
│   └── 2-wildcard.yaml
├── cloudflared-tunnels/
│   └── 1-my-tunnel.yaml
├── users/
│   ├── 1-admin.yaml
│   └── 2-user.yaml
├── settings/
│   ├── default-site.yaml
│   └── ai-config.yaml
└── certificate-files/
    ├── letsencrypt/
    │   └── example.com/
    │       ├── fullchain.pem
    │       ├── privkey.pem
    │       ├── cert.pem
    │       └── chain.pem
    └── custom/
        └── mycert.pem
```

### What is Exported

| Data Type               | Includes                                             |
| ----------------------- | ---------------------------------------------------- |
| **Proxy Hosts**         | All fields including owner, timestamps, meta         |
| **Redirection Hosts**   | All fields                                           |
| **Dead Hosts**          | All fields                                           |
| **Streams**             | All fields                                           |
| **Access Lists**        | Items (with hashed passwords), clients, mTLS config  |
| **Certificates**        | Database entries with meta, provider, domain names   |
| **Certificate Files**   | Let's Encrypt certs, custom certificates (PEM files) |
| **Cloudflared Tunnels** | Tunnel name, token, status, meta                     |
| **Users**               | User data with permissions (no auth credentials)     |
| **Settings**            | All settings except GitOps config                    |

> [!WARNING]
> The export includes sensitive data like hashed passwords, private keys, and Cloudflare tokens. **Always use a private repository!**

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

Your Git credentials (Personal Access Token) are encrypted using **AES-256-GCM** before being stored in the database. The encryption key is derived from the system's key file (`/data/shieldpm/keys.json`).

### Private Repositories

Always use **private repositories** for your configuration backups. The export includes:

- Internal hostnames and IP addresses
- Hashed passwords for Basic Auth
- Private keys for SSL certificates
- User email addresses

## Creating a Personal Access Token

### GitHub

1. Go to **Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Click **Generate new token (classic)**
3. Select scopes: `repo` (Full control of private repositories)
4. Copy the token and paste it in ShieldPM

### GitLab

1. Go to **User Settings → Access Tokens**
2. Create a token with `write_repository` scope
3. Copy the token and paste it in ShieldPM

## Demo Mode

GitOps is **disabled in Demo Mode** for security reasons. All GitOps API endpoints will return a `403 Forbidden` error.

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
