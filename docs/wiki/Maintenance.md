# Maintenance Page Features

> [!NOTE]
> This feature allows you to display a beautiful, custom-branded maintenance page when your upstream service is down, instead of a generic "502 Bad Gateway" error.

---

## 🏗️ Architecture

```
  ┌──────────┐       ┌──────────────────────────────────────────┐
  │  Browser  │──────▶│                 Nginx                    │
  └──────────┘       │                                          │
                     │  Backend UP?                              │
                     │  ┌─────┐                                  │
                     │  │ YES │──▶ Normal Proxy (200 OK)        │
                     │  └─────┘                                  │
                     │  ┌─────┐                                  │
                     │  │ NO  │──▶ 502/504 intercepted          │
                     │  └──┬──┘                                  │
                     │     ▼                                     │
                     │  ┌───────────────────────────────────┐    │
                     │  │  @maintenance_fallback             │    │
                     │  │  Serves: maintenance.html          │    │
                     │  │  (Glassmorphism, Auto Dark Mode)   │    │
                     │  └───────────────────────────────────┘    │
                     └──────────────────────────────────────────┘
```

---

## Maintenance Page on Failure

This feature automatically detects when your upstream application (the service you are proxying to) is offline or unreachable and serves a friendly maintenance page to your visitors.

### How it Works

When enabled, Nginx monitors the connection to your upstream server. If the upstream server returns a `502 Bad Gateway` or `504 Gateway Timeout` error (indicating it is down), Nginx internally redirects the request to a special `@maintenance_fallback` location. This location serves the `maintenance.html` page located in your `rootfs/html/` directory.

### Enabling the Feature

You can enable this feature per Proxy Host:

1. Edit any **Proxy Host** in the dashboard.
2. Go to the **Details** tab.
3. Toggle the switch **"Maintenance Page on Failure"**.
4. Click **Save**.

### Customizing the Page

The default maintenance page uses a modern, glassmorphism design with animations. You can customize the look and feel by editing the file:

`/data/nginx/html/maintenance.html` (if mapped) or ensuring your custom file is mounted to `/usr/local/nginx/html/maintenance.html` inside the container.

The default design includes:

* **Automatic Theme Matching:** Detects if the user's device is in Dark Mode or Light Mode.
* **Animations:** Subtle background animations and a "breathing" status icon.
* **Responsive:** Looks good on mobile and desktop.

### Technical Details

* **Nginx Config:** Adds `proxy_intercept_errors on;` and an `error_page` directive to your host configuration.

---

## Scheduled Maintenance Mode

Starting with version `3.0.0.22`, you can schedule planned maintenance windows or manually trigger maintenance mode for your hosts. This serves the same beautiful maintenance page but with added context for your users.

### Key Features

* **Manual Toggle:** Instantly enable maintenance mode with a single click.
* **Scheduling:** Set a **Start Date** and **End Date** (UTC). The maintenance page will automatically appear and disappear at the specified times.
* **Reason:** Provide a custom reason (e.g., "System Upgrade", "Database Migration") which is displayed on the maintenance page.
* **Countdown Timer:** If an End Date is set, a live countdown timer is shown to visitors.
* **Auto-Reload:** The maintenance page automatically checks status and reloads when the maintenance window is over, reconnecting users to your site without them needing to refresh.

### How to Use

1. Edit any **Proxy Host**.
2. Navigate to the new **Maintenance** tab.
3. **To Manually Enable:** Toggle "Maintenance Active".
4. **To Schedule:**
    * Enter a **Start Date** (when the site goes down).
    * Enter an **End Date** (when the site comes back up).
    * (Optional) Enter a **Reason**.
5. Click **Save**.

The system handles the Nginx reloads automatically based on your schedule.

### Technical Details

* **Database:** Uses `maintenance_active`, `maintenance_start`, `maintenance_end`, and `maintenance_reason` columns in `proxy_host`.
* **Scheduler:** A backend timer checks every minute for maintenance windows starting or ending and triggers Nginx reloads only when state changes are needed.
