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
- `backend/templates/_common.conf` — Gemeinsame TLS-/Listener-Konfiguration inkl. 0-RTT-Opt-in
- `backend/routes/nginx/proxy_hosts.js` (6 KB) — API-Routen
- `backend/schema/components/proxy-host-object.json` — API-Objektschema
- `backend/migrations/20260608000000_add_proxy_upstream_features.js` — Upstream-/0-RTT-Felder
- `frontend/src/modals/ProxyHostModal.tsx` — Proxy-Host-Dialog inkl. Upstream-/Load-Balancing-UI

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
6. Unklar: Der Code soll bei einer Custom-Location mit `path === "/"` die Standard-`/`-Location deaktivieren (`use_default_location = false`). In `backend/internal/nginx.js` wird `host.locations` jedoch vor dieser Prüfung in einen gerenderten String ersetzt; der Check wirkt dadurch wahrscheinlich nicht wie beabsichtigt.

## Upstreams und Load-Balancing

Proxy-Hosts unterstützen zusätzlich zum klassischen Einzelziel (`forward_scheme`, `forward_host`, `forward_port`) ein optionales JSON-Feld `upstream_servers`.

- Leere `upstream_servers` bedeuten: Die bestehende Einzelziel-Konfiguration bleibt aktiv.
- Enthält `upstream_servers` mindestens einen Eintrag, erzeugt `backend/templates/proxy_host.conf` einen hostweiten `upstream shieldpm_proxy_host_<id>`-Block.
- `_proxy_logic.conf` nutzt diesen Upstream-Namen für die Default-Location bei `http`, `https`, `grpc` und `grpcs`.
- Unterstützte Methoden in `load_balancing_method`: `round_robin`, `least_conn`, `ip_hash`, `least_time_header`, `least_time_last_byte`, `random`, `random_two_least_conn`.
- `upstream_http_version` kann für HTTP/HTTPS-Upstreams von `1.1` auf `2` gestellt werden. Bei `2` setzt das Template `proxy_http_version 2` und leert Upgrade-/Connection-Hop-by-Hop-Header.
- Custom-Locations behalten vorerst ihre eigene Einzelziel-Konfiguration und werden nicht automatisch in hostweite Upstream-Gruppen aufgenommen.

Ein Upstream-Server-Eintrag enthält mindestens `host` und `port`. Optional sind `weight`, `max_fails`, `fail_timeout`, `backup` und `down`.

## TLS 1.3 0-RTT

Das Feld `ssl_early_data` aktiviert pro Proxy-Host `ssl_early_data on` in `_common.conf`.

- 0-RTT ist explizit opt-in, weil Early Data replay-anfällig sein kann.
- Die Root-`nginx.conf` aus dem separaten `shieldpm-nginx`-Repository stellt Maps bereit, die Early Data für replay-riskante Methoden erkennen.
- Aktivierte Hosts geben für solche Early-Data-Anfragen HTTP `425` zurück.
- Sichere Methoden wie `GET`, `HEAD` und `OPTIONS` werden nicht blockiert.

## Abhängigkeiten

- `internal/nginx.js` — Config-Generierung und Reload
- `internal/certificate.js` — SSL-Zertifikat-Zuordnung
- `internal/access-list.js` — Zugriffslisten
- `internal/audit-log.js` — Protokollierung
- `models/proxy_host.js` — Datenbank-Modell
- `models/host_domain.js` — Domain-Zuordnung
- `shieldpm-nginx/rootfs/usr/local/nginx/conf/nginx.conf` — Root-Maps für 0-RTT-Replay-Schutz

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
