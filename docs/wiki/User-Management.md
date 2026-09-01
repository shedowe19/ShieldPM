# User Management

Manage who can access your ShieldPM instance and define their permissions.

---

## 🏗️ Architecture

```
  ┌───────────────────────────────────────────────────────┐
  │                  ShieldPM Users                       │
  │                                                       │
  │  ┌─────────────┐     ┌─────────────┐                 │
  │  │    Admin     │     │   Regular   │                 │
  │  │  Full Access │     │  Limited    │                 │
  │  │  All Hosts   │     │  Own Hosts  │                 │
  │  │  Settings    │     │  No Users   │                 │
  │  │  Users       │     │  No Settings│                 │
  │  │  Audit Log   │     │             │                 │
  │  └─────────────┘     └─────────────┘                 │
  └───────────────────────────────────────────────────────┘
```

---

## 👥 Creating Users

1. Navigate to **Users** in the sidebar
2. Click **Add User**
3. Fill in:

| Field         | Description                  | Required |
| :------------ | :--------------------------- | :------: |
| **Full Name** | Display name                 |    ✅    |
| **Email**     | Login email (unique)         |    ✅    |
| **Password**  | Minimum 8 characters         |    ✅    |
| **Nickname**  | Short name for display       |    ❌    |
| **Avatar**    | Gravatar-based (uses email)  |   Auto   |
| **Disabled**  | Block login without deleting |    ❌    |

> [!IMPORTANT]
> The first admin user is created during the **Setup Wizard** on initial launch. There are no default credentials.
> The first request must present the one-time token from `/data/shieldpm/initial-admin-setup-token` in the
> `X-ShieldPM-Setup-Token` header. Token claim and user creation are atomic.

---

## 🔑 Permissions

Permissions control what each user can do. Admins can set permissions per user:

| Permission                   | Description                                            |
| :--------------------------- | :----------------------------------------------------- |
| **Administrator**            | Full access to everything (users, settings, all hosts) |
| **Manage Proxy Hosts**       | Create, edit, delete proxy hosts                       |
| **Manage Redirection Hosts** | Create, edit, delete redirection hosts                 |
| **Manage Dead Hosts**        | Create, edit, delete 404 hosts                         |
| **Manage Streams**           | Create, edit, delete TCP/UDP streams                   |
| **Manage Access Lists**      | Create, edit, delete access lists                      |
| **Manage SSL Certificates**  | Create, manage SSL certificates                        |
| **Only See Own Hosts**       | User can only see and manage hosts they created        |

> [!TIP]
> For a **read-only user** that can view the dashboard but not modify anything, disable all management permissions.

---

## 📜 Audit Log

The Audit Log tracks all changes made within ShieldPM.

### What is Logged

| Event                   | Details Tracked                                        |
| :---------------------- | :----------------------------------------------------- |
| **Host Changes**        | Create, update, delete (proxy, stream, redirect, dead) |
| **User Actions**        | Login, logout, password change, permission changes     |
| **Certificate Actions** | Request, renew, delete                                 |
| **Settings Changes**    | Any settings update                                    |
| **AI Agent Actions**    | All actions performed via AI (marked as AI-initiated)  |
| **Access List Changes** | Create, update, delete                                 |

### Accessing the Audit Log

- Navigate to **Audit Log** in the sidebar (Admin only)
- Each entry shows: **Timestamp**, **User**, **Action**, **Object Type**, **Details**
- IP addresses of the acting user are recorded

> [!NOTE]
> The Audit Log is read-only. Entries cannot be edited or deleted by any user, ensuring an tamper-proof trail for security compliance.

---

## 🔐 API Tokens

Users can create API tokens for programmatic access:

1. Navigate to your **Profile** (click your avatar/name)
2. Click **API Tokens**
3. Create a new token with optional expiry date
4. Use the token in the `Authorization: Bearer <token>` header

> [!WARNING]
> API tokens have the same permissions as the user who created them. Keep them secure and rotate them regularly.

## Administrator impersonation

Impersonation requires an active administrator refresh session and recent authentication. ShieldPM rotates and hides
the actor session, issues a separate target session carrying the actor linkage, and rejects nested impersonation. While
impersonating, step-up and other sensitive actor-only actions are blocked.

Restoring the administrator session verifies both session records, user status, actor/target linkage, family state and
expiry before rotating the actor session and revoking the target family. A copied target cookie is therefore not enough
to recover the administrator context. Audit events retain the effective user and actor relationship.

Refresh tokens rotate on use. A duplicate request inside the short concurrency grace receives a retry response without
clearing the browser's current cookies; replay outside the grace revokes the complete token family. Cookie security is
derived from the effective trusted request scheme, so `Secure` is not enabled based on an untrusted forwarded header.

---

[🏠 Home](Home) | [🔒 Access Lists](Access-Lists) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
