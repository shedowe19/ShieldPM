# Access Lists (ACLs)

Access Lists provide a way to restrict access to your services *before* the request reaches the backend. They support multiple authentication methods that can be combined.

## 🏗️ How it Works

```
  ┌──────────┐     ┌──────────────────────────────────────────┐     ┌──────────┐
  │  Client   │────▶│               Access List                │────▶│ Backend  │
  └──────────┘     │                                          │     └──────────┘
                   │  ┌──────────┐  ┌──────────┐  ┌────────┐ │
                   │  │ IP Check │→ │Basic Auth│→ │ OAuth2 │ │
                   │  │ Allow/   │  │ User/    │  │ SSO    │ │
                   │  │ Deny     │  │ Pass     │  │        │ │
                   │  └──────────┘  └──────────┘  └────────┘ │
                   │                                          │
                   │  ┌──────────┐                            │
                   │  │  mTLS    │  Client Certificate Check  │
                   │  └──────────┘                            │
                   └──────────────────────────────────────────┘
```

**Key Points:**

- Access Lists are created once and can be **shared** across multiple Proxy Hosts
- Multiple protection layers can be combined on a single list
- Use **Satisfy Any** to allow access if *any* condition is met (instead of requiring all)

## 👤 Basic Authentication

Protect a site with a username and password popup.

1. **Create List:** Go to **Access Lists** -> **Add Access List**.
2. **Add User:** Click **Add User**. Enter Username and Password.
3. **Apply:** In your Proxy Host, select this list under **Access List**.

## 🛑 IP Access Control

Restrict access to specific IP addresses or ranges.

- **Allow:** `192.168.1.5` (Single IP) or `10.0.0.0/24` (Subnet).
- **Deny:** Block specific malicious IPs.

> [!NOTE]
> **Logic:** If *any* Allow rule exists, all other IPs are implicitly denied (unless they match another Allow rule). If only Deny rules exist, everyone else is allowed.

## 🔐 Advanced Authorization

### Pass Basic Auth to Backend

If your backend service *also* supports Basic Auth, you might want to pass the credentials through.
- **Option:** Check **Pass Auth to Host**.
- **Effect:** ShieldPM verifies the credentials, then sends the `Authorization: Basic ...` header to the backend.

### Satisfy Any

By default, if you have both Auth and IP rules, Nginx usually requires **all** conditions.
- **Satisfy Any:** If checked, a user can access if they match the IP rule OR if they provide valid credentials. Useful for "No Auth inside Home Network, Auth required from Internet".

## 🔑 OpenID Connect (OIDC) / OAuth2

ShieldPM offers two distinct SSO modes in an Access List: built-in Nginx OIDC (`oidc`) and a managed `oauth2-proxy` process. The steps below describe **built-in OIDC**; use the [OAuth2-Proxy guide](OAuth2-Proxy) for the separate proxy mode.

### Configuration

In the **Access List** dialog, scroll to the Authorization section:

1. **Select Provider:** Choose "OpenID Connect" (or specific presets if available).
2. **Discovery Document URL:** The `.well-known/openid-configuration` endpoint of your IdP.
    - *Example:* `https://auth.example.com/realms/master/.well-known/openid-configuration`
3. **Client ID & Client Secret:** Credentials you generated in your Identity Provider.
4. **Redirect URI:** For built-in OIDC, register `https://<your-service>/_oauth2_callback` with your IdP. The `/oauth2/callback` route belongs to the separate oauth2-proxy mode (and changes if its prefix changes).

### How it works

1. User visits your site.
2. Nginx checks for a valid session cookie.
3. If missing, the built-in OIDC integration redirects the user to the IdP.
4. After success, IdP redirects back to the callback URL.
5. Nginx verifies the token, sets a session cookie, and allows access.

## 🛡️ Mutual TLS (mTLS) 🆕
>
> **Available since v3.0.0.19**

Strictly require clients to present a valid SSL Certificate to access your service. This is ideal for Zero-Trust environments or private APIs.

### Configuration

1. **Generate a CA:** Create a private Certificate Authority (CA) and sign client certificates.
2. **Enable mTLS:** In the Access List modal, go to the **mTLS** tab.
3. **Choose CA Source:**
    - **Option A (Internal CA):** Enable the **"Use Internal CA"** switch. Nginx will verify clients using your built-in Internal Root CA. No file upload needed.
    - **Option B (Custom CA):** Paste the **Public Certificate** of your external CA (in PEM format).
4. **Save & Apply:** Assign the list to a Proxy Host.

### Behavior

- **Enforcement:** Nginx verifies the client certificate and the generated host configuration also returns HTTP 403 when `$ssl_client_verify` is not `SUCCESS`. The failure may appear during TLS negotiation or as an HTTP error, depending on the client and connection.
- **Browser:** Users will be prompted by their browser to select a certificate.
- **API/CLI:** Use `--cert client.crt --key client.key` (e.g. with curl).

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
