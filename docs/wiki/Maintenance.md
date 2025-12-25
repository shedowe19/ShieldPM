# Maintenance Page Features

> [!NOTE]
> This feature allows you to display a beautiful, custom-branded maintenance page when your upstream service is down, instead of a generic "502 Bad Gateway" error.

## Maintenance Page on Failure

This feature automatically detects when your upstream application (the service you are proxying to) is offline or unreachable and serves a friendly maintenance page to your visitors.

### How it Works

When enabled, Nginx monitors the connection to your upstream server. If the upstream server returns a `502 Bad Gateway` or `504 Gateway Timeout` error (indicating it is down), Nginx internally redirects the request to a special `@maintenance_fallback` location. This location serves the `maintenance.html` page located in your `rootfs/html/` directory.

### Enabling the Feature

You can enable this feature per Proxy Host:

1.  Edit any **Proxy Host** in the dashboard.
2.  Go to the **Details** tab.
3.  Toggle the switch **"Maintenance Page on Failure"**.
4.  Click **Save**.

### Customizing the Page

The default maintenance page uses a modern, glassmorphism design with animations. You can customize the look and feel by editing the file:

`/data/nginx/html/maintenance.html` (if mapped) or ensuring your custom file is mounted to `/usr/local/nginx/html/maintenance.html` inside the container.

The default design includes:
*   **Automatic Theme Matching:** Detects if the user's device is in Dark Mode or Light Mode.
*   **Animations:** Subtle background animations and a "breathing" status icon.
*   **Responsive:** Looks good on mobile and desktop.

### Technical Details

*   **Database:** Uses a dedicated `maintenance_on_failure` boolean column in the `proxy_host` table.
*   **Nginx Config:** Adds `proxy_intercept_errors on;` and an `error_page` directive to your host configuration.
