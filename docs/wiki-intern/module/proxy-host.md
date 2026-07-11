# Proxy-Host

## Zweck

Verwaltung von Reverse-Proxy-Hosts — das Kernfeature von ShieldPM.

## Kontext

Proxy-Hosts leiten eingehende HTTP/HTTPS-Anfragen an Upstream-Server weiter. Sie sind das am häufigsten verwendete Feature.

## Wichtige Dateien

- `backend/internal/proxy-host.js` (19 KB) — Business-Logik
- `backend/models/proxy_host.js` (7 KB) — Objection.js-Modell
- `backend/templates/proxy_host.conf` (16 KB) — Nginx-Template
- `backend/templates/_proxy_logic.conf` (17 KB) — Gemeinsame Proxy-Logik
- `backend/routes/nginx/proxy_hosts.js` (6 KB) — API-Routen
- `frontend/src/modals/ProxyHostForwardingFields.tsx` — Formularbereich für Schema, Zielhost, Zielport und Index-Datei
- `frontend/src/modals/ProxyHostPhpSettings.tsx` — Formularbereich für PHP-Hosting bei `path`-Forwarding

## Verhalten

1. Benutzer erstellt Host über UI oder API
2. `internal/proxy-host.js` prüft Berechtigungen und validiert
3. Model speichert in DB (inkl. `host_domains`-Relation)
4. `nginx.js` rendert Template und schreibt `.conf`
5. Nginx wird neu geladen

## Custom Locations

Das Feld `locations` (DB-Feld `custom_locations`, JSON-Array) erlaubt zusätzliche Nginx-`location`-Blöcke pro Host. Jeder Eintrag enthält `path`, `forward_scheme`, `forward_host`, `forward_port`, optional `forward_path` und `advanced_config`.

Mechanik in `nginx.js` → `renderLocations(host)`:

1. Iteration über `host.locations`.
2. Für jede Location wird eine Kopie mit den Host-Eigenschaften (`access_list_id`, `certificate_id`, `ssl_forced`, `caching_enabled`, `block_exploits`, `allow_websocket_upgrade`, `http2_support`, `hsts_enabled`, `hsts_subdomains`, `access_list`, `certificate`) gemischt.
3. Enthält `forward_host` einen Slash und beginnt nicht mit `/` oder `unix`, wird nach dem ersten Segment getrennt: erster Teil → `forward_host`, Rest → `forward_path`.
4. Das Liquid-Template `backend/templates/_proxy_host_custom_location.conf` wird pro Location gerendert.
5. Alle gerenderten Strings werden konkateniert und als String an das Haupt-Template `proxy_host.conf` übergeben.
6. Existiert eine Custom-Location mit `path === "/"`, wird die Standard-`/`-Location automatisch deaktiviert (`use_default_location = false`).

## Abhängigkeiten

- `internal/nginx.js` — Config-Generierung und Reload
- `internal/certificate.js` — SSL-Zertifikat-Zuordnung
- `internal/access-list.js` — Zugriffslisten
- `internal/audit-log.js` — Protokollierung
- `models/proxy_host.js` — Datenbank-Modell
- `models/host_domain.js` — Domain-Zuordnung

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Nginx-Engine](./nginx-engine.md)
- [Redirection-Host](./redirection-host.md)
- [Dead-Host](./dead-host.md)
- [Stream](./stream.md)
- [Host (gemeinsame Logik)](./host.md)
- [Zertifikate](./zertifikate.md)
- [Access-Lists](./access-lists.md)
- [Git-Deploy](./git-deploy.md)
- [Modulübersicht](./README.md)
- [Datenmodell](../daten/datenmodell.md)
