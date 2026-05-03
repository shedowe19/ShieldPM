# Nginx-Engine

## Zweck

Dokumentation der zentralen Nginx-Konfigurationsengine.

## Kontext

Die Nginx-Engine ist das "Gehirn" von ShieldPM. Sie liest den Datenbankzustand, rendert EJS-Templates und schreibt `.conf`-Dateien.

## Wichtige Dateien

- `backend/internal/nginx.js` (12 KB) — Hauptlogik
- `backend/templates/proxy_host.conf` (16 KB) — Proxy-Host-Template
- `backend/templates/_proxy_logic.conf` (17 KB) — Gemeinsame Proxy-Logik
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
4. Schreibt `.conf`-Dateien nach `/data/nginx/`
5. Führt `nginx -s reload` aus (debounced, 2s)

## Wichtige Hinweise

- `nginx -t` wird **nicht** vor dem Reload ausgeführt
- Reload ist debounced (2s Verzögerung)
- Templates verwenden EJS-Syntax mit Liquid-Fallback

## Verwandte Seiten

- [Datenfluss](../architektur/datenfluss.md)
- [Proxy-Host](./proxy-host.md)
- [Redirection-Host](./redirection-host.md)
- [Dead-Host](./dead-host.md)
- [Stream](./stream.md)
- [Host (gemeinsame Logik)](./host.md)
- [IP-Ranges](./ip-ranges.md)
- [Modulübersicht](./README.md)
