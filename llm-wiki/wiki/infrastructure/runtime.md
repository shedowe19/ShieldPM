# Laufzeit und Start

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Diese Seite erklärt, wie eine ShieldPM-Instanz hochfährt — im Container und
nativ — und welche Reihenfolge dabei gilt. Sie ist die Referenz für Änderungen an
Startskripten und systemd-Units.

## Container-Startkette

```
tini -g -- entrypoint.sh
  └─ entrypoint.sh
       ├─ ENABLE_PRERUN prüfen
       ├─ backup-restore.js --apply   (falls vorhanden; einmaliger Offline-Restore)
       ├─ /data/npmplus → /data/shieldpm migrieren (falls nötig)
       ├─ CrowdSec-Konfiguration nach /data/crowdsec kopieren
       ├─ /data/prerun/*.sh ausführen (nur bei ENABLE_PRERUN=true)
       └─ exec envs.sh
            ├─ /data/.env laden, GeoIP vorbereiten (update-geoip.py)
            ├─ validate-env.cjs, Variablen exportieren
            ├─ environment-hash prüfen → ggf. REGENERATE_ALL
            └─ exec migration.sh → exec start.sh → exec launch.sh
                 ├─ start.sh: Verzeichnisse und Altpfade migrieren (migrate-data.sh)
                 ├─ launch.sh: OCSP-Stapling aktualisieren (optional)
                 ├─ launch.sh: nginx -tq; bei Fehler defekte Hosts mit fehlenden Zerts entfernen
                 └─ launch.sh: Nginx + Backend starten, auf beide warten
```

Quellen: `rootfs/usr/local/bin/entrypoint.sh`, `envs.sh`, `migration.sh`,
`start.sh:4,426,442` und `migrate-data.sh`, `launch.sh`.

## Ports und Bindung

| Variable                                | Standard           | Zweck                          |
| --------------------------------------- | ------------------ | ------------------------------ |
| `NPM_PORT`                              | `81`               | Verwaltungsoberfläche          |
| `GOA_PORT`                              | `91`               | GoAccess-Dashboard             |
| `HTTP_PORT`                             | `80`               | proxyte Hosts, HTTP            |
| `HTTPS_PORT`                            | `443`              | proxyte Hosts, HTTPS (TCP+UDP) |
| `HTTP3_ALT_SVC_PORT`                    | `443`              | Alt-Svc für HTTP/3             |
| `IPV4_BINDING` / `IPV6_BINDING`         | alle               | globale Bindung                |
| `NPM_IPV4_BINDING` / `NPM_IPV6_BINDING` | `0.0.0.0` / `[::]` | nur UI                         |
| `GOA_IPV4_BINDING` / `GOA_IPV6_BINDING` | `0.0.0.0` / `[::]` | nur GoAccess                   |

Quelle: `compose.yaml:36-56`.

## Datenablage

- Volume-Vertrag: `/data` (`compose.yaml:24`). Im Beispiel wird ein Host-Pfad
  dorthin gemountet.
- Datenbankkonfiguration: `/data/shieldpm/default.json`; Schlüssel:
  `/data/shieldpm/keys.json` (`backend/lib/config.js:7-17`).
- Nginx-Konfigurationen: `/data/nginx/`; TLS: `/data/tls/`.
- Weitere Unterordner: `/data/crowdsec`, `/data/prerun`, `/data/certbot-plugins`.
- **Regel:** Nichts Persistente außerhalb von `/data` ablegen.

## Native Installation

`scripts/install.sh` installiert ohne Docker:

- prüft ein vollständiges Release-Paket (App, Frontend, Nginx-Binary, Startskripte)
- nimmt eine exklusive Wartungssperre (`flock`) auf `/run/shieldpm-maintenance`
- fragt Datenbankzugangsdaten ab und schreibt sie in die Umgebung
- legt systemd-Units an (`rootfs/usr/lib/systemd/system/shieldpm.service`)
- kann eine Installation zurückrollen

Quelle: `scripts/install.sh:20-26,38-55,456-482,794-830`.

## Risiken und Stolperfallen

- **Restore vor allem anderen:** `backup-restore.js --apply` läuft vor Migrationen
  und Prerun-Skripten. Ein Restore darf nicht nach hinten wandern.
- **Nginx-Startprüfung:** `launch.sh` löscht die Nginx-Konfigurationsdatei von
  Hosts, deren Zertifikatsdateien fehlen, damit Nginx überhaupt startet. Der
  Datenbankeintrag bleibt bestehen; es ist kein Löschen des Hosts.
- **Zwei Prozesse, eine Sperre:** Installer und Updater teilen sich die
  Wartungssperre. Ein zweiter Lauf muss abbrechen, nicht warten.
- **Prerun:** `ENABLE_PRERUN=true` führt beliebige Skripte aus `/data/prerun` als
  Root aus. Nur in kontrollierten Umgebungen aktivieren.

## GeoIP-Verhalten

- `envs.sh` führt `update-geoip.py` vor `validate-env.cjs` aus. Bei einem
  Update-Fehler nutzt das Skript einen vollständigen, validierten Cache und fährt
  fort; ohne vollständigen Cache endet der Start vor der Validierung
  (`rootfs/usr/local/bin/envs.sh:40`, `update-geoip.py:436-458`).

## Verwandte Seiten

- [Build und Release](./build-and-release.md)
- [Konfiguration](./configuration.md)
- [Hintergrundjobs](../architecture/background-jobs.md)
- [Rootfs-Referenz (Tiefe)](../reference/konfiguration/rootfs.md)
- [Deployment (Tiefe)](../reference/entwicklung/deployment.md)
