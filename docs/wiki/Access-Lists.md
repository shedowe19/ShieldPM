# Access Lists (ACLs)

Access Lists provide a way to restrict access to your services *before* the request reaches the backend.

## 👤 Basic Authentication

Protect a site with a username and password popup.

1.  **Create List:** Go to **Access Lists** -> **Add Access List**.
2.  **Add User:** Click **Add User**. Enter Username and Password.
3.  **Apply:** In your Proxy Host, select this list under **Access List**.

## 🛑 IP Access Control

Restrict access to specific IP addresses or ranges.

*   **Allow:** `192.168.1.5` (Single IP) or `10.0.0.0/24` (Subnet).
*   **Deny:** Block specific malicious IPs.

> [!NOTE]
> **Logic:** If *any* Allow rule exists, all other IPs are implicitly denied (unless they match another Allow rule). If only Deny rules exist, everyone else is allowed.

## 🔐 Advanced Authorization

### Pass Basic Auth to Backend
If your backend service *also* supports Basic Auth, you might want to pass the credentials through.
*   **Option:** Check **Pass Auth to Host**.
*   **Effect:** NPMplus verifies the credentials, then sends the `Authorization: Basic ...` header to the backend.

### Satisfy Any
By default, if you have both Auth and IP rules, Nginx usually requires **all** conditions.
*   **Satisfy Any:** If checked, a user can access if they match the IP rule OR if they provide valid credentials. Useful for "No Auth inside Home Network, Auth required from Internet".

## 🔑 OpenID Connect (OIDC) / OAuth2

NPMplus supports modern Single Sign-On using OpenID Connect (supported by Keycloak, Google, Authentik, Authelia, etc.).

### Configuration
In the **Access List** dialog, scroll to the Authorization section:

1.  **Select Provider:** Choose "OpenID Connect" (or specific presets if available).
2.  **Discovery Document URL:** The `.well-known/openid-configuration` endpoint of your IdP.
    *   *Example:* `https://auth.example.com/realms/master/.well-known/openid-configuration`
3.  **Client ID & Client Secret:** Credentials you generated in your Identity Provider.
4.  **Redirect URI:** Ensure your IdP allows the callback URL: `https://<your-service>/oauth2/callback`.

### How it works
1.  User visits your site.
2.  Nginx checks for a valid session cookie.
3.  If missing, user is redirected to the IdP (e.g., "Sign in with Google").
4.  After success, IdP redirects back to the callback URL.
5.  Nginx verifies the token, sets a session cookie, and allows access.

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/NPMplus/issues)
