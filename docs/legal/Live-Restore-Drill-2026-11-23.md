# Live-Restore-Drill – 2026-11-23

**Status:** durchgeführt auf einer lokalen Wegwerf-Instanz. Kein Produktions-Restore.

## Umgebung

- WSL2 Ubuntu, Node.js 26.13.1, Nginx 1.24.0, SQLite.
- Backend aus dem Branch `fix/security-hardening`, `DATA_PATH=/data`.
- Admin `admin@live.test`, Testhost `live-restore.local`.
- Kein TLS/ACME, keine externe Datenbank, keine produktiven Daten.

## Ablauf

1. Instanz eingerichtet, Admin angelegt, Proxy-Host `live-restore.local` erstellt (`id=1`).
2. Verschlüsseltes Instanzbackup über `POST /api/backups` erstellt:
   - ID `5ccd1144-ee24-44f8-b173-0ad6f1352a1f`
   - Größe 32.930 Bytes, App 4.4.1, Datenbank `sqlite`.
3. `POST /api/backups/<id>/preflight` mit dem Backup-Passwort: HTTP 202, Job `completed`, Ergebnis `valid: true`.
4. Daten mutiert: `DELETE /api/nginx/proxy-hosts/1`; Hostliste danach leer.
5. `POST /api/backups/<id>/restore` mit `confirmation: "RESTORE <id>"`: HTTP 202, Job `completed`, Ergebnis `valid: true`, `files: 21`, `activation: next_restart`.
6. Dienst gestoppt, `DATA_PATH=/data node backup-restore.js --apply` ausgeführt (der native Entrypoint macht diesen Schritt vor dem Backendstart), Dienst gestartet.
7. Hostliste nach dem Neustart: `live-restore.local` ist wieder vorhanden.

## Ergebnis

**Bestanden.** Ein vollständiger Backup-→-Mutation-→-Restore-Zyklus hat den gelöschten Host und die zugehörige Konfiguration wiederhergestellt.

```text
preflight_http=202   preflight_status=completed
hosts_after_delete=[]
restore_http=202     restore_status=completed
hosts_after_restart=[['live-restore.local']]
```

## Dabei gefundene und behobene Fehler

- **Rate-Limiter hinter Unix-Socket:** `req.ip` war leer, weil ein Unix-Socket keine Remote-Adresse hat; dadurch lieferten rate-limitierte Endpunkte (u. a. Backup-Erstellung) HTTP 500. Behoben durch validierten `X-Real-IP`-/`X-Forwarded-For`-Fallback vor Rate-Limiter und Audit-Kontext; Test `request-context-client-ip.spec.js`. Mit der Standard-Trust-Proxy-Konfiguration verifiziert.
- **Erstes Host-Verzeichnis:** Eine frische native Instanz konnte `/data/nginx/proxy_host/1.conf` nicht schreiben; `generateConfig` legt das Verzeichnis jetzt an.
- **Setup-Navigation:** Die Setup-Seite lief außerhalb des Routers; nach dem Anlegen des ersten Admins führt sie nun zum Dashboard.

## Grenzen

- Die Instanz lief lokal in WSL, nicht als produktive Container-/Native-Installation.
- Kein externes MariaDB/PostgreSQL, kein TLS/ACME, kein echtes Nginx-Basisimage.
- Der Restore wurde bewusst über `backup-restore.js --apply` aktiviert, weil der lokale systemd-Testdienst den Container-Entrypoint nicht ausführt.
- Ein Restore-Drill gegen die produktive Instanz mit realen Daten und echtem Backup-Ziel bleibt beim Betreiber.
