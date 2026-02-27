# Tor Onion Services

ShieldPM includes native support for **Tor Onion Services** (Hidden Services), allowing you to expose your proxied services over the Tor network. This is ideal for:

- **Privacy**: Hide your server's IP address from visitors
- **CGNAT Bypass**: Expose services without port forwarding
- **Censorship Resistance**: Access your services from anywhere

## 🧅 How It Works

Tor Onion Services work by creating a `.onion` address that is only accessible via the Tor network (using Tor Browser or a Tor proxy). Unlike regular web hosting, onion services:

- Don't require a public IP or open ports
- Encrypt all traffic end-to-end
- Provide anonymity for both server and client

```
  ┌──────────────┐     ┌─────────────────────┐     ┌─────────────────────────┐
  │  Tor Browser  │────▶│     Tor Network      │────▶│       ShieldPM          │
  │  (Client)     │     │  (3-hop encrypted    │     │                         │
  └──────────────┘     │   relay circuit)     │     │  ┌───────────────────┐  │
                       └─────────────────────┘     │  │   Tor Daemon      │  │
                                                   │  │  (Hidden Service) │  │
                                                   │  │  *.onion:80/443   │  │
                                                   │  └────────┬──────────┘  │
                                                   │           │             │
                                                   │           ▼             │
                                                   │  ┌───────────────────┐  │
                                                   │  │  Nginx (Proxy)    │  │
                                                   │  │  Access Lists,    │  │
                                                   │  │  WAF, Caching     │  │
                                                   │  └────────┬──────────┘  │
                                                   └───────────┼─────────────┘
                                                               ▼
                                                   ┌───────────────────────┐
                                                   │   Backend Service     │
                                                   └───────────────────────┘
```

ShieldPM manages Onion Services by communicating with the Tor daemon via the **Control Port** (localhost:9051).

## 📋 Prerequisites

- **Tor Enabled**: Ensure `TOR_ENABLED=true` (default) in your environment
- **Tor Daemon**: Automatically started by ShieldPM
- **Tor Browser**: Clients need Tor Browser to access `.onion` addresses

## 🚀 Creating an Onion Service

1. Navigate to **Hosts → Tor Onion** in the sidebar
2. Click **Add Onion Service**
3. Configure:
   - **Name**: A friendly name for your service
   - **Virtual Port**: The port exposed on the `.onion` address (usually `80` or `443`)
   - **Target Port**: The local port to forward to (e.g., `80` for HTTP, `443` for HTTPS)
4. Click **Save**

ShieldPM will:

- Generate a new **ED25519-V3** keypair
- Create a unique `.onion` address (56 characters)
- Start the Hidden Service immediately

## 🔧 Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| **Name** | - | A friendly identifier for the service |
| **Virtual Port** | 80 | Port exposed on the `.onion` address |
| **Target Port** | 80 | Local port traffic is forwarded to |

### Example Configuration

| Use Case | Virtual Port | Target Port |
|----------|--------------|-------------|
| HTTP website | 80 | 80 |
| HTTPS website | 443 | 443 |
| Custom app | 8080 | 3000 |

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TOR_ENABLED` | `true` | Enable/disable the Tor daemon |

## 🔐 Security

### Private Key Storage

Onion Service private keys are **encrypted at rest** using AES-256-GCM. The encryption key is derived from your ShieldPM instance's master key stored in `/data/shieldpm/keys.json`.

### Control Port Authentication

The Tor Control Port is:

- Only accessible from `127.0.0.1` (localhost)
- Protected by an auto-generated password stored in `/data/shieldpm/tor-control-password`
- Never exposed to the network

### Demo Mode

Tor Onion Services are **completely disabled** in Demo Mode for security reasons. The menu item is hidden and all API endpoints return 403 errors.

## 📂 File Locations

| Path | Description |
|------|-------------|
| `/data/tor/` | Tor data directory |
| `/data/shieldpm/tor-control-password` | Control Port password |
| `/data/tor/tor.log` | Tor daemon logs |
| `/etc/tor/torrc` | Tor configuration file |

## 🔄 Service Lifecycle

### Starting a Service

1. **First time**: A new keypair and `.onion` address are generated
2. **Subsequent starts**: The existing keypair is used to restore the same `.onion` address

### Stopping a Service

- The service is removed from Tor's memory
- The keypair remains encrypted in the database
- Restarting will restore the same `.onion` address

### Deleting a Service

- The service is stopped
- The keypair is permanently deleted
- The `.onion` address is lost forever

> ⚠️ **Warning**: Keep a backup of your database if you need to preserve `.onion` addresses!

## 🔐 HTTPS vs. HTTP over Tor

A common question is whether you need HTTPS (SSL/TLS) for an Onion Service.

### Short Answer: No

Onion Services provide **end-to-end encryption and authentication** natively by the Tor protocol. When you connect to a `.onion` address, the Tor circuit itself ensures that:

- The connection is encrypted
- You are talking to the correct server (the address is a hash of the public key)

Because of this, **Port 80 (HTTP) is completely safe** for sensitive content over Tor.

### When to use HTTPS (Port 443)?

You should only use HTTPS over Tor if:

1. **Frontend Requirements**: Your backend application *enforces* HTTPS and won't work without it.
2. **Double Encryption**: You want an extra layer of security (e.g., from the browser process to the app container).
3. **EV Certificates**: You have an expensive Extended Validation certificate for your onion address (rare).

> 💡 **Tip**: Using self-signed certificates for Onion addresses will still trigger browser warnings, even though Tor is already secure. For 99% of use cases, standard HTTP (Port 80) is the recommended way.

## ⚖️ Legal & Ethical Use

**Important Note**: The Tor Onion Services feature in ShieldPM is designed to empower users with **privacy**, **censorship resistance**, and **secure remote access** to legitimate self-hosted services (e.g., Nextcloud, Home Assistant, personal blogs) without exposing public IP addresses or requiring complex port forwarding.

This feature is **not** intended to facilitate illegal activities, the hosting of illicit content, or the operation of "Dark Web" marketplaces. ShieldPM provides this technology to foster a freer and more secure internet for everyone. Users are responsible for complying with all applicable laws and regulations in their jurisdiction regarding the content they host.

## 🔍 Troubleshooting

### Tor Not Available

If you see "Tor daemon is not available":

1. Check if Tor is running:

   ```bash
   # Docker
   docker exec shieldpm pgrep tor

   # Native / LXC
   pgrep tor
   ```

2. Check Tor logs:

   ```bash
   # Docker
   docker exec shieldpm cat /data/tor/tor.log

   # Native / LXC
   cat /data/tor/tor.log
   ```

3. Ensure `TOR_ENABLED` is not set to `false`

### Onion Service Not Accessible

1. Wait 30-60 seconds after creation (circuit establishment takes time)
2. Verify the `.onion` address is correct (56 characters + `.onion`)
3. Ensure you're using Tor Browser
4. Check that the target service is running on the configured port

### Control Port Connection Failed

1. Verify password file exists:

   ```bash
   # Docker
   docker exec shieldpm cat /data/shieldpm/tor-control-password

   # Native / LXC
   cat /data/shieldpm/tor-control-password
   ```

2. Check Tor configuration:

   ```bash
   # Docker
   docker exec shieldpm cat /etc/tor/torrc

   # Native / LXC
   cat /etc/tor/torrc
   ```

## 📖 Further Reading

- [Tor Project: Onion Services](https://community.torproject.org/onion-services/)
- [Tor Hidden Service Protocol](https://spec.torproject.org/rend-spec-v3.html)
- [Security Best Practices](Security)

---
[🏠 Home](Home) | [🔒 Security](Security) | [☁️ Cloudflare Tunnels](Cloudflared-Tunnels)
