# Raspberry Pi Installation

ShieldPM bietet vorgebaute **ARM64 Images** für Raspberry Pi 4B (und neuere Modelle), basierend auf **Debian Trixie**.

> [!IMPORTANT]
> **Unterstützte Hardware**
> - Raspberry Pi 4 Model B (2GB+ RAM empfohlen)
> - Raspberry Pi 5
> - Raspberry Pi 400
>
> **Features**
> - Vollständig nativ kompiliert (kein Docker)
> - Alle Raspberry Pi Tools inkl. `raspi-config`
> - HTTP/3 (QUIC) Support
> - ModSecurity WAF vorinstalliert

---

## 1. Download & Flash

1. Lade das neueste Image von der **[Releases](https://github.com/shedowe19/ShieldPM/releases)** Seite:
   - `shieldpm-rpi4-vX.X.X.img.xz`
2. Flash mit **[Raspberry Pi Imager](https://www.raspberrypi.com/software/)** oder **balenaEtcher**
3. SD-Karte einlegen und Raspberry Pi starten

> [!TIP]
> Das Image ist mit `xz` komprimiert. Raspberry Pi Imager kann dies direkt verarbeiten, ohne vorheriges Entpacken.

---

## 2. Erste Einrichtung

### Netzwerk
Der Raspberry Pi bezieht automatisch eine IP über DHCP.

### SSH Zugang
```bash
ssh root@shieldpm.local
# Passwort: shieldpm
```

> [!WARNING]
> **Ändere das Passwort sofort nach dem ersten Login!**
> ```bash
> passwd
> ```

### Web UI
Nach dem Boot ist die Web-Oberfläche erreichbar unter:
- `http://shieldpm.local:81`
- `http://<IP-ADRESSE>:81`

**Standard-Login:**
- Email: `admin@example.com`
- Password: `changeme`

---

## 3. Konfiguration

Die Konfiguration erfolgt über eine `.env` Datei:

```bash
nano /data/.env
```

**Wichtige Variablen:**

| Variable | Beschreibung | Beispiel |
|:---------|:-------------|:---------|
| `TZ` | Zeitzone | `Europe/Berlin` |
| `ACME_EMAIL` | Let's Encrypt Email | `deine@email.de` |
| `DB_MYSQL_HOST` | MySQL Host (optional) | `192.168.1.100` |

Nach Änderungen:
```bash
systemctl restart shieldpm
```

---

## 4. Updates

ShieldPM kann direkt auf dem Raspberry Pi aktualisiert werden:

```bash
update
```

Dies lädt den neuesten Code, baut Frontend/Backend neu und startet den Service.

---

## 5. Unterschiede zu Docker/LXC

| Merkmal | Docker | LXC | Raspberry Pi |
|:--------|:------:|:---:|:------------:|
| Boot-Partition | ❌ | ❌ | ✅ |
| Bare-Metal | ❌ | ❌ | ✅ |
| Kernel-Update | ❌ | ❌ | ✅ |
| Hardware-Zugriff | ❌ | Teilweise | ✅ |
| SD-Karte flashen | ❌ | ❌ | ✅ |

> [!NOTE]
> Das Raspberry Pi Image enthält einen vollständigen Linux-Kernel mit allen Raspberry Pi-spezifischen Treibern (VideoCore, GPIO, etc.).

---

## 6. Performance-Tipps

### Overclock (optional)
Bearbeite `/boot/config.txt`:
```ini
over_voltage=2
arm_freq=1800
```

### USB SSD Boot (empfohlen)
Für bessere Performance, boote von einer USB-SSD statt SD-Karte.

### Swap deaktivieren
```bash
systemctl disable dphys-swapfile
```
