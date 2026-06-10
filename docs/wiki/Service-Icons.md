# 🎨 Service Icons

ShieldPM supports displaying service icons for Proxy Hosts in the dashboard table. This feature makes it easier to visually identify services at a glance.

## Overview

The feature offers three modes for icon handling:

1.  **Auto (Default):** Automatically detects the service based on the target port and hostname.
2.  **Custom:** Allows you to specify a custom icon URL.
3.  **None:** Disables the icon for the host.

---

## 🛠️ Configuration

You can configure the icon settings in the **"Details"** tab of the Proxy Host dialog, right below the "Forward Host/Port" section.

### 1. Auto-Detection

This is the default mode. ShieldPM maintains an internal database of ~80 popular self-hosted services and their default ports.

**Detection Logic:**

1.  **Port + Hostname Match:** First, it checks if both the port and the hostname match a known service (e.g., Port `3000` + Hostname containing `grafana`).
2.  **Port Match:** If no specific hostname match is found, it falls back to checking just the port (e.g., Port `8123` → Home Assistant).

**Supported Services (Examples):**
| Port | Service |
| :--- | :--- |
| `8123` | Home Assistant |
| `8096` | Jellyfin |
| `32400` | Plex |
| `9000` | Portainer |
| `9090` | Prometheus |
| `11000` | Nextcloud |
| `8384` | Syncthing |
| `8989` | Sonarr |
| `7878` | Radarr |

> 💡 **Note:** The icons are sourced from the [Homarr Labs Dashboard Icons](https://github.com/homarr-labs/dashboard-icons) repository (SVG format).

### 2. Custom Icons

Select **"Custom"** from the Icon Type dropdown to provide your own icon.

- **Input:** Enter a direct URL to an image file (SVG, PNG, JPG).
- **Preview:** A live preview of the icon will appear in the dialog.

### 3. No Icon

Select **"No Icon"** to display nothing in the icon column for this host.

---

## 📸 Screenshots

_(Screenshots of the feature in action would go here)_

## 🧩 Troubleshooting

**My icon is not showing up?**

- Check if the **port** matches the standard port for the service.
- If using **Custom**, verify that the URL is reachable and returns a valid image.
- If using **Auto**, the service might not be in our database yet. You can switch to **Custom** and provide the URL manually.
