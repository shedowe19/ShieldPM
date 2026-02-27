# Internal PKI & Post-Quantum Security

ShieldPM includes a built-in **Internal Certificate Authority (CA)** that lets you issue trusted certificates for internal services without relying on external providers like Let's Encrypt. This is ideal for services not exposed to the public internet.

---

## 🏗️ Architecture

```
  ┌──────────────────────────────────────────────────────────┐
  │                    ShieldPM Internal CA                    │
  │                                                          │
  │  ┌────────────────────────────────────────────────────┐  │
  │  │            Root CA (ECDSA P-384)                   │  │
  │  │            Valid: 10 years                         │  │
  │  │            Self-signed                             │  │
  │  └────────────────┬───────────────────────────────────┘  │
  │                   │ Signs                                │
  │          ┌────────┴────────┐                             │
  │          ▼                 ▼                             │
  │  ┌──────────────┐  ┌──────────────┐                     │
  │  │ Server Cert  │  │ Client Cert  │                     │
  │  │ (HTTPS)      │  │ (mTLS)       │                     │
  │  │ 1/5/10 years │  │ P12 Export   │                     │
  │  └──────────────┘  └──────────────┘                     │
  └──────────────────────────────────────────────────────────┘
                        │
            ┌───────────┼───────────┐
            ▼           ▼           ▼
     ┌──────────┐ ┌──────────┐ ┌──────────┐
     │ Proxy    │ │ Browser  │ │ API      │
     │ Host     │ │ Client   │ │ Client   │
     │ (HTTPS)  │ │ (mTLS)   │ │ (mTLS)   │
     └──────────┘ └──────────┘ └──────────┘
```

---

## ✨ Features

| Feature | Description |
| :--- | :--- |
| **Self-Hosted Root CA** | ECDSA P-384 (secp384r1), auto-generated |
| **Long Validity** | Root CA: 10 years, Leaf certs: 1, 5, or 10 years |
| **Post-Quantum Key Exchange** | ML-KEM-768 (Kyber) for quantum-safe TLS handshakes |
| **Server Certificates** | HTTPS certificates for internal services |
| **Client Certificates** | mTLS identity certificates with P12 export |
| **Secure Storage** | Private keys stored with `0600` permissions |
| **No External Dependencies** | Works fully offline, no internet required |

---

## 📥 Step 1: Install the Root CA

Before browsers and devices trust your internal certificates, you must install the Root CA:

1. Go to **SSL Certificates** in the ShieldPM UI
2. Click the **🔑 Root CA** button at the top
3. Download the `root_ca.crt` file
4. Install it on your devices:

| Platform | How to Install |
| :--- | :--- |
| **Windows** | Double-click `.crt` → Install Certificate → Local Machine → Trusted Root |
| **macOS** | Double-click `.crt` → Keychain Access → System → Always Trust |
| **Linux** | Copy to `/usr/local/share/ca-certificates/` → Run `update-ca-certificates` |
| **iOS** | AirDrop/Email `.crt` → Settings → Profile → Install → Trust |
| **Android** | Settings → Security → Install from Storage → Select `.crt` |
| **Firefox** | Settings → Privacy → Certificates → Import → Trust for websites |

> [!IMPORTANT]
> Firefox uses its own certificate store. Even on Windows/macOS, you must import the Root CA separately in Firefox.

---

## 📜 Step 2: Create a Server Certificate

1. Go to **SSL Certificates** → **Add Certificate** → **Internal (ECDSA)**
2. Enter domain names (e.g., `web.internal`, `*.home.lan`)
3. Select validity: **1 year**, **5 years**, or **10 years**
4. Click **Save**
5. Assign to a Proxy Host in the **SSL** tab

> [!TIP]
> Wildcard certificates (`*.home.lan`) are supported and work for all subdomains.

---

## 🔐 Step 3: Create Client Certificates (mTLS)

Client certificates allow you to enforce **Zero Trust** — only devices with a valid certificate can access your service.

1. Go to **SSL Certificates** → **Add Certificate** → **Internal (ECDSA)**
2. Select **Certificate Type**: **Client Identity (mTLS)**
3. Enter an **Identity Name** (e.g., `my-laptop`, `work-phone`)
4. Set a **P12 Export Password** (required for secure import)
5. Click **Save** — your browser downloads a `.p12` file

### Installing the Client Certificate

| Platform | How to Install |
| :--- | :--- |
| **Windows** | Double-click `.p12` → Enter password → Personal store |
| **macOS** | Double-click `.p12` → Enter password → Keychain |
| **iOS** | AirDrop/Email `.p12` → Enter password → Install Profile |
| **Linux/curl** | `curl --cert client.crt --key client.key https://...` |

### Enforcing mTLS on a Host

1. Create an **Access List**
2. Go to the **mTLS** tab
3. Enable **Use Internal CA**
4. Assign this Access List to your Proxy Host

Only clients presenting a valid certificate signed by your Internal CA will be allowed in.

---

## 🔬 Technical Details

| Property | Value |
| :--- | :--- |
| **Key Algorithm** | ECDSA P-384 (secp384r1) |
| **Key Exchange** | `X25519MLKEM768` (Post-Quantum Hybrid), fallback `X25519` |
| **Storage Path** | `/data/tls/internal/` |
| **Root CA Validity** | 10 years |
| **Leaf Certificate Validity** | 1, 5, or 10 years |

> [!NOTE]
> **Post-Quantum Security**: The ML-KEM-768 key exchange protects against future quantum computers that could break classical key exchange algorithms. Your certificate signatures remain ECDSA (classical), but the session key negotiation is quantum-safe.

---

[🏠 Home](Home) | [🔒 SSL Certificates](SSL-Certificates) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
