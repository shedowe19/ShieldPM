# User Management

ShieldPM administrators manage accounts from **Users** in the sidebar. The first administrator is created during initial setup; the application does not provide default login credentials.

## Create and manage an account

1. Open **Users** and select **Add User**.
2. Enter a full name, nickname, and unique email address. The account form also offers avatar settings, an administrator switch, and a disabled switch.
3. Save the account. Set or change its password from the user row's **Set Password** action. Passwords must have at least 8 characters and at most 72 UTF-8 bytes.

The initial setup form requests a password while creating the first administrator. The regular **Add User** form does not contain a password field; an administrator sets it separately. Disabled accounts cannot log in, and the **Sign in as** row action is unavailable for them. Deleting an account and disabling it are different operations.

An administrator can edit, disable, delete, or sign in as another enabled account from its row menu. A user can edit their own profile and password, but cannot change their own administrator role or disabled status. The avatar can use Gravatar, a URL, or an uploaded image.

## Permissions

Open a user's row menu and select **Permissions**. Each resource offers **Hidden**, **View**, or **Manage**, subject to the permissions of the account making the request:

| Resource | What it controls |
| --- | --- |
| Proxy hosts | Reverse-proxy hosts |
| Redirection hosts | Redirect rules |
| 404 hosts | Dead-host pages |
| Streams | TCP/UDP streams |
| Access lists | Access control definitions |
| SSL certificates | Certificate records and actions |
| Cloudflare tunnels | Cloudflared integrations |
| DDNS providers | Dynamic DNS integrations |
| Tor onion services | Onion-service integrations |
| Analytics | Traffic views |
| Dashboard notes | Shared notes on the dashboard |
| ChatOps | Telegram integration management |

**Visibility** independently selects **All** or **Own** for resources that use ownership. Administrator accounts have full access. The permission editor automatically grants at least view access to related access lists or certificates when a dependent host type is made visible. There is no separate permission toggle for the audit log or global settings; those require administrator access.

**View** lets a user see the resource without granting its management actions. **Hidden** removes access. **Manage** enables actions for that resource where the backend authorizes them. Permissions are checked by the API as well as reflected in the interface; hiding a button is not the security boundary. The dashboard's host-count report is available to authenticated users and takes the user's visibility setting into account.

## Audit log

Administrators can inspect the **Audit Log**. Its entries store an action, acting user ID, object type and ID, metadata, and timestamps. The page supports search, filters, paging, and export of the **currently displayed page** as CSV. Events depend on whether the underlying operation writes an audit record; the audit log is not a complete record of logins, logouts, or every AI/chat request. Audit entries do not have a dedicated client IP field and are not cryptographically tamper proof.

Search matches the action, object type, and metadata. Filters include action, object type, acting user ID, object ID, and a time range. The page displays at most 100 events at once, with navigation to additional pages; its CSV export only includes the currently loaded page. Some service actions write entries with metadata, so check the entry's details when investigating a change.

## API authentication

The browser uses access and refresh sessions. The login API issues an access token for authenticated API requests; the browser can also use its HTTP-only authentication cookies. ShieldPM does not currently expose a **Profile → API Tokens** creation or management screen. If you automate against the API, use the documented login/refresh flow and protect the resulting credentials.

Administrators can temporarily **Sign in as** a user from the Users table. The original administrator session can be restored through the session control while its backup token remains valid. Session tokens are not permanent API keys. Changing a password revokes that user's refresh-session family, so existing sessions may need to sign in again.

## Sign in to ShieldPM with OIDC

ShieldPM has an OIDC flow for signing in to **the ShieldPM admin interface**. This is separate from the OAuth2-Proxy access-list feature for sites behind a proxy host. An administrator can configure the `oidc-config` setting through the settings API with `enabled`, `name`, `issuerURL`, `clientID`, `clientSecret`, and `redirectURL` (the callback URL is `https://<your-shieldpm-host>/api/oidc/callback`). The current login screen has no OIDC launch button; start the configured flow at `/api/oidc`.

The identity provider must return a verified email address matching an existing enabled ShieldPM user; this flow does not create users. After the callback, the browser claims a short-lived handoff cookie and establishes its normal ShieldPM session. Keep the client secret private. The public `GET /api/settings/oidc-config` response only exposes the provider name and whether the flow is ready, not the stored credentials.

[🏠 Home](Home) | [🔒 Access Lists](Access-Lists) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
