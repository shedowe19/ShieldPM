# OAuth2-Proxy Integration

ShieldPM natively integrates with [OAuth2-Proxy](https://github.com/oauth2-proxy/oauth2-proxy) to provide robust authentication using various identity providers. Instead of building your own authentication flow, you can offload this to ShieldPM and OAuth2-Proxy.

## Supported Providers

ShieldPM supports the following providers out of the box:

- **Google** (`google`)
- **GitHub** (`github`)
- **GitLab** (`gitlab`)
- **Azure** (`azure`)
- **Keycloak** (`keycloak-oidc`)
- **OpenID Connect (OIDC)** (`oidc`)

All these providers are officially supported by OAuth2-Proxy and seamlessly integrated into the ShieldPM Access List configuration.

## Setup Guide

To protect a proxy host with OAuth2-Proxy:

1. Go to **Access Lists** in the ShieldPM Dashboard.
2. Click **Add Access List** (or edit an existing one).
3. Under the **SSO** tab, select **OAuth2 Proxy** as the Provider Type.
4. Fill in the required fields:
   - **Provider**: Select your identity provider (e.g., Google, GitHub, OIDC).
   - **Client ID**: The Client ID obtained from your identity provider.
   - **Client Secret**: The Client Secret obtained from your identity provider.
   - **Cookie Secret**: A secret used to encrypt the session cookie. This **must** be exactly 16, 24, or 32 bytes long. You can generate one using `openssl rand -base64 24`.

### Provider-Specific Configurations

#### OpenID Connect (OIDC)

If you select **OpenID Connect** (`oidc`), you must also provide the **OIDC Issuer URL** (e.g., `https://accounts.google.com` or `https://auth.yourdomain.com`).

#### Allowed Emails / Domains / Groups

You can restrict access to specific users by configuring:

- **Allowed Emails**: Comma-separated list of allowed email addresses (e.g., `user1@example.com,user2@example.com`).
- **Allowed Domains**: Comma-separated list of allowed email domains (e.g., `example.com`).
- **Allowed Groups**: Comma-separated list of allowed groups (provider dependent).

## How It Works Internally

When you apply an Access List with OAuth2-Proxy to a Proxy Host, ShieldPM does the following:

1. **Spawns a Process**: It automatically spawns a dedicated `oauth2-proxy` process in the background, specific to that Access List.
2. **Generates Config**: It creates the corresponding `oauth2-proxy.cfg` configuration file dynamically based on your Access List settings.
3. **Configures Nginx**: It updates the Nginx configuration for the assigned Proxy Host to intercept incoming requests and validate them against the spawned `oauth2-proxy` instance via Unix Sockets (`/run/shieldpm/oauth2-proxy-<id>.sock`).

This ensures that authentication happens extremely fast with minimal overhead, and completely isolated per Access List.
