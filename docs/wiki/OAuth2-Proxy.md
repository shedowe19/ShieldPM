# OAuth2-Proxy Integration

ShieldPM natively integrates with [OAuth2-Proxy](https://github.com/oauth2-proxy/oauth2-proxy) to provide robust authentication using various identity providers. Instead of building your own authentication flow, you can offload this entirely to ShieldPM — no extra containers, no manual config files.

---

## Supported Providers

| Provider          | Config Value    | OIDC Issuer URL Required |
| :---------------- | :-------------- | :----------------------- |
| Google            | `google`        | No (built-in)            |
| GitHub            | `github`        | No (built-in)            |
| GitLab            | `gitlab`        | No (built-in)            |
| Azure AD          | `azure`         | No (built-in)            |
| Keycloak          | `keycloak-oidc` | Yes                      |
| Authentik         | `oidc`          | Yes                      |
| Authelia          | `oidc`          | Yes                      |
| Any OIDC Provider | `oidc`          | Yes                      |

> **Tip:** If your identity provider supports OpenID Connect, you can use it with the generic `oidc` provider type by supplying the Issuer URL.

---

## Quick Start

### 1. Create an Access List

1. Go to **Access Lists** in the ShieldPM Dashboard.
2. Click **Add Access List** and give it a descriptive name (e.g. "OAuth2 - Authentik").
3. Navigate to the **SSO** tab.
4. Select **OAuth2 Proxy** as the Auth Type.
5. Fill in the required fields:
   - **Provider**: Select your identity provider (e.g. `oidc`, `google`, `github`).
   - **Client ID**: From your identity provider.
   - **Client Secret**: From your identity provider.
   - **Cookie Secret**: A secret to encrypt session cookies (see below).
   - **OIDC Issuer URL**: _(Only for OIDC/Keycloak)_ The discovery endpoint base URL.
6. Click **Save**.

### 2. Generate a Cookie Secret

The cookie secret **must** be exactly 16, 24, or 32 bytes long. Generate one with:

```bash
# 32-byte secret (recommended)
openssl rand -base64 32 | head -c 32

# Or using Python
python3 -c "import os, base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode()[:32])"
```

### 3. Assign to a Proxy Host

1. Go to **Proxy Hosts** and edit the host you want to protect.
2. In the **Zugriffsliste / Access List** dropdown, select the Access List you created.
3. Click **Save**.

ShieldPM will automatically:

- Spawn the `oauth2-proxy` process for this Access List
- Configure Nginx to intercept and validate requests via `auth_request`
- Redirect unauthenticated users to your identity provider's login page

---

## Provider Configuration Examples

### Authentik (OIDC)

[Authentik](https://goauthentik.io/) is a popular open-source identity provider. Use the generic `oidc` provider type.

#### Step 1: Create an OAuth2/OpenID Provider in Authentik

1. Go to **Applications → Providers → Create**.
2. Select **OAuth2/OpenID Provider**.
3. Configure:
   - **Name**: `ShieldPM OAuth2 Proxy`
   - **Authorization Flow**: Select your default authorization flow
   - **Client Type**: `Confidential`
   - **Redirect URIs**: `https://your-domain.example.com/oauth2/callback` (one per protected domain, or use Regex mode with `.*`)
   - **Signing Key**: ⚠️ **Select an RSA key** (e.g. `authentik Self-signed Certificate`). **Do NOT leave this empty** — without a signing key, Authentik uses HS256 which is incompatible with OAuth2-Proxy.
   - **Scopes**: `openid`, `email`, `profile`

#### Step 2: Create an Application in Authentik

1. Go to **Applications → Applications → Create**.
2. Link it to the provider you just created.

#### Step 3: Configure in ShieldPM

| Field                 | Value                                                        |
| :-------------------- | :----------------------------------------------------------- |
| Provider              | `oidc`                                                       |
| Client ID             | _(from Authentik provider)_                                  |
| Client Secret         | _(from Authentik provider)_                                  |
| Cookie Secret         | _(generated with openssl)_                                   |
| OIDC Issuer URL       | `https://auth.example.com/application/o/your-provider-slug/` |
| Allowed Email Domains | `example.com` _(or `_` for all)\*                            |

> **⚠️ Important:** The OIDC Issuer URL must match the `issuer` field in the `.well-known/openid-configuration` response. For Authentik, this is `https://auth.example.com/application/o/<slug>/` — note the **trailing slash**.

> **⚠️ Important:** You **must** select an RSA Signing Key (Signaturschlüssel) in Authentik. If left empty, Authentik defaults to HS256 which causes `failed to verify id_token signature` errors.

---

### Keycloak (OIDC)

[Keycloak](https://www.keycloak.org/) is an enterprise-grade identity provider.

#### Step 1: Create a Client in Keycloak

1. Go to **Clients → Create Client**.
2. Configure:
   - **Client ID**: `shieldpm-oauth2`
   - **Client Protocol**: `openid-connect`
   - **Access Type**: `Confidential`
   - **Valid Redirect URIs**: `https://your-domain.example.com/oauth2/callback`
   - **Web Origins**: `https://your-domain.example.com`
3. Under the **Credentials** tab, copy the **Client Secret**.

#### Step 2: Configure in ShieldPM

| Field                 | Value                                            |
| :-------------------- | :----------------------------------------------- |
| Provider              | `oidc`                                           |
| Client ID             | `shieldpm-oauth2`                                |
| Client Secret         | _(from Keycloak Credentials tab)_                |
| Cookie Secret         | _(generated with openssl)_                       |
| OIDC Issuer URL       | `https://keycloak.example.com/realms/your-realm` |
| Allowed Email Domains | `*`                                              |

---

### Google

#### Step 1: Create OAuth2 Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Click **Create Credentials → OAuth client ID**.
3. Select **Web Application**.
4. Add **Authorized redirect URIs**: `https://your-domain.example.com/oauth2/callback`
5. Copy the **Client ID** and **Client Secret**.

#### Step 2: Configure in ShieldPM

| Field                 | Value                                             |
| :-------------------- | :------------------------------------------------ |
| Provider              | `google`                                          |
| Client ID             | _(from Google Console)_                           |
| Client Secret         | _(from Google Console)_                           |
| Cookie Secret         | _(generated with openssl)_                        |
| Allowed Email Domains | `example.com` _(or `_` for all Google accounts)\* |

> **Note:** No OIDC Issuer URL required — Google's endpoints are built into OAuth2-Proxy.

---

### GitHub

#### Step 1: Create an OAuth App

1. Go to [GitHub → Settings → Developer settings → OAuth Apps](https://github.com/settings/developers).
2. Click **New OAuth App**.
3. Configure:
   - **Homepage URL**: `https://your-domain.example.com`
   - **Authorization callback URL**: `https://your-domain.example.com/oauth2/callback`
4. Copy the **Client ID** and generate a **Client Secret**.

#### Step 2: Configure in ShieldPM

| Field          | Value                                 |
| :------------- | :------------------------------------ |
| Provider       | `github`                              |
| Client ID      | _(from GitHub)_                       |
| Client Secret  | _(from GitHub)_                       |
| Cookie Secret  | _(generated with openssl)_            |
| Allowed Emails | `user@example.com` _(specific users)_ |

> **Note:** GitHub uses usernames, not email domains, for access control. Use **Allowed Emails** to restrict access to specific GitHub accounts, or **Allowed Groups** for GitHub organizations/teams.

---

### GitLab

#### Step 1: Create an Application

1. Go to **GitLab → Admin Area → Applications** (or User Settings → Applications for self-managed).
2. Click **New Application**.
3. Configure:
   - **Redirect URI**: `https://your-domain.example.com/oauth2/callback`
   - **Scopes**: `openid`, `email`, `profile`
4. Copy the **Application ID** and **Secret**.

#### Step 2: Configure in ShieldPM

| Field                 | Value                      |
| :-------------------- | :------------------------- |
| Provider              | `gitlab`                   |
| Client ID             | _(Application ID)_         |
| Client Secret         | _(Secret)_                 |
| Cookie Secret         | _(generated with openssl)_ |
| Allowed Email Domains | `*`                        |

> **Note:** For self-hosted GitLab, you may need to set the OIDC Issuer URL to `https://gitlab.example.com`.

---

### Authelia (OIDC)

[Authelia](https://www.authelia.com/) is a lightweight authentication server.

#### Step 1: Configure an OIDC Client in Authelia

Add the following to your Authelia `configuration.yml`:

```yaml
identity_providers:
  oidc:
    clients:
      - client_id: shieldpm-oauth2
        client_name: ShieldPM
        client_secret: "$pbkdf2-sha512$..." # hashed secret
        redirect_uris:
          - https://your-domain.example.com/oauth2/callback
        scopes:
          - openid
          - email
          - profile
          - groups
        authorization_policy: two_factor
```

#### Step 2: Configure in ShieldPM

| Field           | Value                      |
| :-------------- | :------------------------- |
| Provider        | `oidc`                     |
| Client ID       | `shieldpm-oauth2`          |
| Client Secret   | _(unhashed secret)_        |
| Cookie Secret   | _(generated with openssl)_ |
| OIDC Issuer URL | `https://auth.example.com` |

---

## Access Control

You can restrict who can access a protected host by configuring:

| Field                     | Description                                | Example                              |
| :------------------------ | :----------------------------------------- | :----------------------------------- |
| **Allowed Emails**        | Comma-separated email addresses            | `admin@example.com,user@example.com` |
| **Allowed Email Domains** | Comma-separated domains                    | `example.com,corp.com`               |
| **Allowed Groups**        | Comma-separated groups (provider-specific) | `admins,devops`                      |

- **All three are optional.** If none are set, `email_domains = ["*"]` is used (any authenticated user).
- **Groups** are provider-dependant. Authentik exposes groups via the `groups` claim. Keycloak requires a mapper.

---

## Advanced Settings

### Custom OAuth2 Prefix

By default, the OAuth2 Proxy paths are served under `/oauth2/`. You can change this in the Access List settings under **OAuth2 Proxy Prefix** (e.g. `/auth/`).

### Custom Scopes

Some providers require additional scopes. Set them in the **Scopes** field (e.g. `openid email profile groups`).

### PKCE (Proof Key for Code Exchange)

OAuth2-Proxy will automatically detect if your provider supports PKCE (`S256`) and will display a warning if it's not enabled. For maximum security, enable it via the provider settings. ShieldPM does not currently expose a UI toggle for this — it relies on the provider's OIDC Discovery to advertise support.

---

## How It Works Internally

When you apply an Access List with OAuth2-Proxy to a Proxy Host, ShieldPM does the following:

```
   ┌──────────┐    ┌─────────┐    ┌──────────────┐    ┌──────────┐
   │  Browser  │───▶│  Nginx  │───▶│ OAuth2-Proxy │───▶│ Provider │
   └──────────┘    └─────────┘    └──────────────┘    └──────────┘
        │               │                │                   │
        │  1. Request    │                │                   │
        │───────────────▶│  2. auth_request                   │
        │               │───────────────▶│                   │
        │               │  3. 401/403    │                   │
        │               │◀───────────────│                   │
        │  4. Redirect to /oauth2/start  │                   │
        │◀───────────────│                │                   │
        │  5. Redirect to Provider       │                   │
        │────────────────────────────────────────────────────▶│
        │  6. Login + Callback           │                   │
        │◀────────────────────────────────────────────────────│
        │  7. /oauth2/callback           │                   │
        │───────────────▶│───────────────▶│  8. Validate     │
        │               │  9. Set Cookie │                   │
        │  10. Redirect to original URL  │                   │
        │◀───────────────│                │                   │
        │  11. Request with Cookie       │                   │
        │───────────────▶│  12. auth_request ──▶ 200 ✓       │
        │               │  13. Proxy to upstream             │
```

1. **Spawns a Process**: A dedicated `oauth2-proxy` process per Access List, listening on a Unix socket (`/run/shieldpm/oauth2-proxy-<id>.sock`).
2. **Generates Config**: Creates `oauth2-proxy.cfg` dynamically based on your settings.
3. **Configures Nginx**: Adds `auth_request` directives to intercept and validate every request.
4. **Lifecycle Management**: The process is only started when the Access List is actually assigned to a Proxy Host. It's automatically stopped when unassigned or when the last Proxy Host using it is deleted.

---

## Troubleshooting

### `failed to verify id_token signature`

**Cause:** Your OIDC provider is using HS256 (symmetric) instead of RS256 (asymmetric) for token signing.

**Fix:** Configure your provider to use an **RSA signing key**. In Authentik, go to the Provider settings and select a key under **Signaturschlüssel** (Signing Key). Do **not** leave it empty.

### Redirect Loop (`/oauth2/sign_in?rd=...` repeating)

**Cause:** The `auth_request` directive is being applied to the `/oauth2/` paths themselves.

**Fix:** This is handled automatically by ShieldPM — `auth_request off;` is set on all `/oauth2/` locations. If you see this after a manual Nginx config edit, ensure these locations are excluded.

### `OIDC Discovery: 404 Not Found`

**Cause:** The OIDC Issuer URL is incorrect or your provider is temporarily unreachable.

**Fix:** Verify the URL by visiting `<issuer_url>/.well-known/openid-configuration` in your browser. It should return a JSON document. Also check for trailing slashes — some providers require them.

### `connect() to unix:/run/shieldpm/oauth2-proxy-<id>.sock failed`

**Cause:** The `oauth2-proxy` process is not running. This can happen when the Access List was created but not yet assigned to a Proxy Host.

**Fix:** Assign the Access List to a Proxy Host and save. ShieldPM will automatically start the process or restart ShieldPM.

### `unexpected status "502"` on auth_request

**Cause:** The OAuth2-Proxy process crashed or failed to start (e.g. due to invalid credentials or unreachable provider).

**Fix:** Check the ShieldPM logs for `[OAuth2Proxy #<id>]` entries. Common causes:

- Invalid Client ID/Secret
- Unreachable OIDC Issuer URL
- Missing signing key in provider

---

## Further Reading

- [OAuth2-Proxy Documentation](https://oauth2-proxy.github.io/oauth2-proxy/)
- [OAuth2-Proxy Nginx Integration Guide](https://oauth2-proxy.github.io/oauth2-proxy/configuration/integrations/nginx)
- [Authentik OAuth2 Provider Docs](https://docs.goauthentik.io/docs/providers/oauth2/)
- [Keycloak OIDC Docs](https://www.keycloak.org/docs/latest/server_admin/#_oidc_clients)
