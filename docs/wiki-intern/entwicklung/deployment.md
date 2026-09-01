# Deployment

## Zweck

ShieldPM unterstützt Docker sowie native/LXC-Installationen auf Debian. Alle Varianten verwenden Node.js 24 LTS,
Corepack, repository-pinned Yarn 4 und persistieren dynamische Daten ausschließlich unter `/data`.

## Docker

```bash
curl -o compose.yaml https://raw.githubusercontent.com/shedowe19/ShieldPM/refs/heads/develop/compose.yaml
docker compose up -d
```

- Management-UI: HTTP Port 81 (nicht direkt in untrusted Netze exponieren)
- Proxy: Ports 80/TCP und 443/TCP+UDP
- Backend: `/run/shieldpm.sock`, nicht als TCP-Port veröffentlicht
- Persistenz: Hostpfad/Volume nach `/data`

Auf dem ersten Start wird kein Standard-Credential erzeugt. Der Betreiber liest lokal den One-Time-Token aus
`/data/shieldpm/initial-admin-setup-token` oder mountet eine `0600`-Secret-Datei per
`INITIAL_ADMIN_SETUP_TOKEN_FILE`.

## Native / LXC

`scripts/install.sh` prüft das Release-Archiv und dessen internes `SHA256SUMS`-Manifest, richtet NodeSource signiert ein,
verifiziert Node 24, aktiviert Corepack 0.36.0/Yarn 4.18.0, baut immutable in Staging und installiert eine gehärtete
systemd-Unit. Persistente Secrets erhalten restriktive Rechte; der Service bekommt nur die nötigen Schreibpfade und
Fähigkeiten. Mutable Remote-Skripte werden nicht ausgeführt.

`update-shieldpm`:

1. prüft Quelle und Update-Artefakte;
2. erstellt vor Änderungen eine konsistente SQLite-/Daten-Sicherung;
3. baut den neuen Payload isoliert aus Lockfiles;
4. aktiviert atomar und startet den Service;
5. prüft den Health-Endpunkt über den Unix-Socket;
6. stellt bei Fehler den vorherigen Payload wieder her.

Für externe MySQL/PostgreSQL-Datenbanken muss der Betreiber vorab einen nativen Dump erstellen, dessen Restore testen
und dies mit `--external-db-backup-confirmed` bestätigen. Payload-Rollback kann eine externe DB-Migration nicht
rückgängig machen; nach einem Fehlschlag bleibt ShieldPM deshalb bis zum operatorgeführten Restore gestoppt.

## Shutdown

`SIGTERM`/`SIGINT` stoppt neue Hintergrundarbeit, schließt den Listener, wartet auf Analytics-Drain sowie laufende
DDNS-/Integrationsarbeit, beendet Terminal-Sessions und schließt Datenbankverbindungen. Docker/systemd benötigen dafür
eine ausreichende Stop-Zeit; `SIGKILL` umgeht die Durability-Grenze.

## CI/CD und Supply Chain

Workflows unter `.github/workflows/` bauen/testen Node 24 und eine neuere kompatible Runtime, führen die vollständigen
Workspace-Gates und die SQLite/MySQL/PostgreSQL-Migrationsmatrix aus. Aktionen und Binärdownloads werden auf
unveränderliche Identitäten geprüft. Drittanbieterhinweise entstehen reproduzierbar aus installierten direkten Paketen.

GitHub Rulesets/Branch Protection sind externe Repository-Einstellungen und müssen im GitHub-Projekt manuell aktiviert
werden. Auch das bewegliche Basisimage `ghcr.io/shedowe19/shieldpm-nginx:master` kann erst dann digest-gepinnt werden,
wenn das externe Image-Repository einen unterstützten Digest bereitstellt.

## Versionierung

`.version`, `backend/package.json` und `frontend/package.json` bleiben synchron. Ein Patch-/Minor-/Major-Bump benötigt
eine explizite Entscheidung; Dokumentations- oder Sicherheitsarbeit erhöht die Version nicht automatisch.

## Verwandte Seiten

- [Build](./build.md)
- [Tests](./tests.md)
- [Setup intern](./setup-intern.md)
- [Rootfs](../konfiguration/rootfs.md)
- [Security-Modernisierung](../entscheidungen/2026-08-31-security-modernisierung.md)
