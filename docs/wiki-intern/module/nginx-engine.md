# Nginx-Engine

## Zweck

Dokumentation der zentralen Nginx-Konfigurationsengine.

## Kontext

Die Nginx-Engine ist das "Gehirn" von ShieldPM. Sie liest den Datenbankzustand, rendert EJS-Templates und schreibt `.conf`-Dateien.

## Wichtige Dateien

- `backend/internal/nginx.js` — Hauptlogik und Staging/Validation
- `backend/templates/proxy_host.conf` — Proxy-Host-Template
- `backend/templates/_proxy_logic.conf` — Gemeinsame Proxy-Logik
- `backend/templates/_proxy_host_custom_location.conf` — Partial für `custom_locations` (Liquid-Syntax, eingebettet in `proxy_host.conf`)
- `backend/templates/_common.conf` (3 KB) — Gemeinsame Konfiguration
- `backend/templates/stream.conf` (3 KB) — Stream-Template
- `backend/templates/redirection_host.conf` — Redirect-Template
- `backend/templates/dead_host.conf` — 404-Template
- `backend/templates/default.conf` — Default-Server
- `backend/templates/ip_ranges.conf` — IP-Ranges

## Verhalten

1. `nginx.js` wird getriggert bei CRUD-Operationen auf Hosts
2. Liest aktuelle Daten aus der Datenbank
3. Rendert EJS-Templates mit Host-Daten
4. Rendert den vollständigen Kandidaten in ein abgeschottetes Staging-Verzeichnis
5. Führt `nginx -t` gegen den Kandidaten aus
6. Aktiviert/Reloaded erst bei Erfolg; sonst werden DB und Runtime-Dateien kompensiert

## Wichtige Hinweise

- `nginx -t` prüft den vollständigen Kandidaten, nicht nur eine einzelne Hostdatei
- Runtime-Mutationen müssen das DB-Transaction-/Compensation-Protokoll verwenden
- Direkte `nginx -s reload`-Aufrufe außerhalb der Engine umgehen Rollback und sind verboten
- Templates verwenden EJS-Syntax mit Liquid-Fallback

## Erweiterte Methoden

### Config-Backup/Restore

Staging/Backup werden in privaten, contained Verzeichnissen vorbereitet. Rename/Swap und Cleanup sind erst nach
erfolgreicher Validation/Reload endgültig. Der aufrufende Service registriert DB- und Dateikompensation für
Render-, Validation- und Reload-Fehler.

### Fehlerbehandlung

- Fehlerantworten nennen die fehlgeschlagene Phase, ohne Secrets oder vollständige sensitive Configs zu loggen.

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
- [Proxy-Host](./proxy-host.md)
- [Redirection-Host](./redirection-host.md)
- [Dead-Host](./dead-host.md)
- [Stream](./stream.md)
- [Host (gemeinsame Logik)](./host.md)
- [IP-Ranges](./ip-ranges.md)
- [Modulübersicht](./README.md)
