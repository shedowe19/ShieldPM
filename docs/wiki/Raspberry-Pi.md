# Raspberry Pi Installation

ShieldPM provides pre-built **ARM64 images** for Raspberry Pi 4B and newer models, based on **Debian Trixie**.

> [!IMPORTANT]
> **Supported Hardware**
> - Raspberry Pi 4 Model B (2GB+ RAM recommended)
> - Raspberry Pi 5
> - Raspberry Pi 400
>
> **Features**
> - Fully natively compiled (no Docker)
> - All Raspberry Pi tools including `raspi-config`
> - HTTP/3 (QUIC) support
> - ModSecurity WAF pre-installed

---

## 1. Download & Flash

1. Download the latest image from the **[Releases](https://github.com/shedowe19/ShieldPM/releases)** page:
   - `shieldpm-rpi4-vX.X.X.img.xz`
2. Flash with **[Raspberry Pi Imager](https://www.raspberrypi.com/software/)** or **balenaEtcher**
3. Insert SD card and boot your Raspberry Pi

> [!TIP]
> The image is compressed with `xz`. Raspberry Pi Imager can handle this directly without prior extraction.

---

## 2. Initial Setup

### Network
The Raspberry Pi automatically obtains an IP via DHCP.

### SSH Access
```bash
ssh root@shieldpm.local
# Password: shieldpm
```

> [!WARNING]
> **Change the password immediately after first login!**
> ```bash
> passwd
> ```

### Web UI
After boot, the web interface is accessible at:
- `http://shieldpm.local:81`
- `http://<IP-ADDRESS>:81`

**Default Login:**
- Email: `admin@example.com`
- Password: `changeme`

---

## 3. Configuration

Configuration is done via a `.env` file:

```bash
nano /data/.env
```

**Important Variables:**

| Variable | Description | Example |
|:---------|:------------|:--------|
| `TZ` | Timezone | `Europe/Berlin` |
| `ACME_EMAIL` | Let's Encrypt Email | `your@email.com` |
| `DB_MYSQL_HOST` | MySQL Host (optional) | `192.168.1.100` |

After changes:
```bash
systemctl restart shieldpm
```

---

## 4. Updates

ShieldPM can be updated directly on the Raspberry Pi:

```bash
update
```

This downloads the latest code, rebuilds Frontend/Backend, and restarts the service.

---

## 5. Differences from Docker/LXC

| Feature | Docker | LXC | Raspberry Pi |
|:--------|:------:|:---:|:------------:|
| Boot Partition | ❌ | ❌ | ✅ |
| Bare-Metal | ❌ | ❌ | ✅ |
| Kernel Updates | ❌ | ❌ | ✅ |
| Hardware Access | ❌ | Partial | ✅ |
| Flash to SD Card | ❌ | ❌ | ✅ |

> [!NOTE]
> The Raspberry Pi image includes a complete Linux kernel with all Raspberry Pi-specific drivers (VideoCore, GPIO, etc.).

---

## 6. Performance Tips

### Overclock (optional)
Edit `/boot/config.txt`:
```ini
over_voltage=2
arm_freq=1800
```

### USB SSD Boot (recommended)
For better performance, boot from a USB SSD instead of SD card.

### Disable Swap
```bash
systemctl disable dphys-swapfile
```
