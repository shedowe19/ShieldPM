# User Management

Manage who can access your NPMplus instance and how they access your services.

## 👥 Users & Permissions

*   **Admin User:** Full control over all hosts, settings, and users.
*   **Initial User:** Created on first launch (default: `admin@example.org`).
*   **Permissions:** You can restrict users to specific capabilities (e.g., only manage their own hosts, read-only access).

## 🛑 Access Lists (ACLs)

Access Lists allow you to protect your Proxy Hosts with Basic Authentication or IP Whitelisting.

1.  Navigate to **Access Lists** in the UI.
2.  Create a new list (e.g., "Home Network Only", "Admin Auth").
3.  **Authorization:** Add username/password pairs.
4.  **Access:** Add IP ranges to Allow/Deny (e.g., `192.168.1.0/24`).
5.  **Apply:** In any Proxy Host configuration, select the Access List from the dropdown.

## 📜 Audit Log

The **Audit Log** tracks changes made within the NPMplus interface.

*   **What is logged?**
    *   creation/update/deletion of Hosts.
    *   User logins and password changes.
    *   Settings updates.
*   **Visibility:** Only Admins can view the full Audit Log.
*   **Usage:** Useful for troubleshooting "who changed what" and for security compliance.

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/NPMplus/issues)
