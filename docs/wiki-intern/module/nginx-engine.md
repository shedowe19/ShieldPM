# Nginx-Engine

## Zweck

Dokumentation der zentralen Nginx-Konfigurationsengine.

## Kontext

Die Nginx-Engine ist das "Gehirn" von ShieldPM. Sie liest den Datenbankzustand, rendert Liquid-Templates und schreibt `.conf`-Dateien.

## Wichtige Dateien

- `backend/internal/nginx.js` (12 KB) — Hauptlogik
- `backend/templates/proxy_host.conf` (16 KB) — Proxy-Host-Template
- `backend/templates/_proxy_logic.conf` (17 KB) — Gemeinsame Proxy-Logik
- `backend/templates/_proxy_host_custom_location.conf` — Partial für `custom_locations` (Liquid-Syntax, eingebettet in `proxy_host.conf`)
- `backend/templates/_common.conf` (3 KB) — Gemeinsame Konfiguration
- `backend/templates/stream.conf` (3 KB) — Stream-Template
- `backend/templates/redirection_host.conf` — Redirect-Template
- `backend/templates/dead_host.conf` — 404-Template
- `backend/templates/default.conf` — Default-Server
- `backend/templates/ip_ranges.conf` — IP-Ranges

## Verhalten

1. `nginx.js` wird getriggert bei CRUD-Operationen auf Hosts
2. Liest aktuelle Host-Daten aus der Datenbank
3. Rendert Liquid-Templates mit Host-Daten und Umgebungsvariablen
4. Schreibt `.conf`-Dateien nach `/data/nginx/`
5. Legt bei vorhandenen Host-Konfigurationen eine `.bak`-Sicherung an
6. Ruft nach der Generierung `test()` und anschließend, sofern `skip_reload` nicht gesetzt ist, `reload()` auf

## Wichtige Hinweise

- `nginx -t` wird aktuell **nicht** ausgeführt. Die Methode `test()` ist ein No-op und gibt `true` zurück.
- Dadurch werden Template- oder Laufzeitfehler nicht vor dem Reload abgefangen. Das Backup/Restore-Verhalten hilft bei Generierungsfehlern, ersetzt aber keine echte Nginx-Validierung.
- `reload()` führt direkt `nginx -s reload` aus. Nur Docker Auto-Discovery bündelt Reloads über `docker.js` mit einem 2-Sekunden-Debounce.
- Templates verwenden Liquid-Syntax über `liquidjs`; ein EJS-Fallback ist im aktuellen Code nicht erkennbar.

## Erweiterte Methoden

### Config-Backup/Restore

- `backupConfig(host_type, host)` — Erstellt eine `.conf.bak` Sicherungskopie der aktuellen Config vor Änderungen
- `restoreConfig(host_type, host)` — Stellt die `.conf.bak` Sicherung wieder her (z.B. nach fehlgeschlagenem `nginx -t`)
- `deleteBackupConfig(host_type, host)` — Löscht die Backup-Datei nach erfolgreichem Configure (Commit)

### Fehlerbehandlung

- `renameConfigAsError(host_type, host)` — Benennt eine fehlerhafte Config als `.conf.err` um, bevor die Backup wiederhergestellt wird

### Bulk-Operationen

- `bulkGenerateConfigs(model, host_type, hosts)` — Generiert mehrere Host-Configs am Stück (ohne Reload) für GitOps oder Massen-Reload-Szenarien. Setzt `skip_reload: true` pro Host und wartet auf alle Promises.

### Config-Parsing

- `advancedConfigHasDefaultLocation(advanced_config)` — Parst das `advanced_config`-Feld und prüft, ob ein `location /` Block definiert ist. Gibt `true` zurück, wenn vorhanden. Beeinflusst, ob der Default-Location-Block hinzugefügt wird.

### Anubis-Integration

Nach einem erfolgreichen `configure()` wird `internalAnubis.generatePolicy()` **asynchron** aufgerufen (non-blocking). Dies aktualisiert die Anubis-Sicherheitspolicy basierend auf der neuen Nginx-Konfiguration, ohne den Configure-Flow zu blockieren.

## Abhängigkeiten

- `lib/utils.js` — Render-Engine (`getRenderEngine()`, Liquid-basiert)
- `internal/proxy-host.js`, `internal/redirection-host.js`, `internal/dead-host.js`, `internal/stream.js` — rufen die Engine bei CRUD auf
- `internal/certificate.js` — wird beim Generieren der Host-Configs gelesen
- `internal/access-list.js` — wird in den Templates referenziert
- `internal/anubis.js` — `generatePolicy()` wird nach erfolgreichem Configure asynchron aufgerufen
- Externes Binary `nginx` (für `nginx -s reload`)

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Datenfluss](../architektur/datenfluss.md)
- [Nginx-Templates](./nginx-templates.md)
- [Proxy-Host](./proxy-host.md)
- [Redirection-Host](./redirection-host.md)
- [Dead-Host](./dead-host.md)
- [Stream](./stream.md)
- [Host (gemeinsame Logik)](./host.md)
- [IP-Ranges](./ip-ranges.md)
- [Modulübersicht](./README.md)
