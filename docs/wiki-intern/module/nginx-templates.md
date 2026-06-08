# Nginx Config Templates

## Zweck

Dokumentation der Liquid-Templates für Nginx-Konfigurationsdateien.

## Kontext

Die Templates werden von `backend/internal/nginx.js` über `liquidjs` gerendert und nach `/data/nginx/` geschrieben.

## Template-Dateien

### Proxy-Hosts

| Datei                              | Zweck                                        |
| ---------------------------------- | -------------------------------------------- |
| `proxy_host.conf` (16 KB)          | Haupt-Template für Proxy-Hosts               |
| `_proxy_logic.conf` (17 KB)        | Gemeinsame Proxy-Logik (eingebettet)         |
| `_proxy_host_custom_location.conf` | Partial für Custom-Locations (Liquid-Syntax) |

### Spezial-Hosts

| Datei                   | Zweck                     |
| ----------------------- | ------------------------- |
| `redirection_host.conf` | 301/302 Umleitungen       |
| `dead_host.conf`        | 404 "Not Found" Hosts     |
| `stream.conf`           | TCP/UDP Stream-Forwarding |

### System

| Datei            | Zweck                                                      |
| ---------------- | ---------------------------------------------------------- |
| `_common.conf`   | Gemeinsame Listener-, TLS-, ACME- und Header-Konfiguration |
| `default.conf`   | Default-Server (unbekannte Hosts)                          |
| `ip_ranges.conf` | Cloudflare IP-Ranges (GeoIP)                               |

## Template-Engine

- **Engine**: `backend/lib/utils.js` → `getRenderEngine()`
- **Syntax**: Liquid (`{% if %}`, `{% include %}`, Filter wie `nginxAccessRule`)
- **Hinweis**: Ein EJS-Fallback ist im aktuellen Code nicht erkennbar.

## Moderne Nginx-Funktionen

- `_common.conf` und `default.conf` erzeugen pro Host die `quic`-Listener und setzen `Alt-Svc` für HTTP/3, sofern `DISABLE_H3_QUIC=false` und kein PROXY-Protokoll aktiv ist. `_common.conf` aktiviert außerdem pro Host optional `ssl_early_data on` und blockt replay-riskante Early-Data-Methoden mit HTTP `425`.
- `proxy_host.conf` kann vor den `server`-Blöcken hostweite `upstream shieldpm_proxy_host_<id>`-Blöcke erzeugen, wenn `upstream_servers` gesetzt ist.
- `_proxy_logic.conf` verdrahtet pro Host CrowdSec über Lua, erweitertes Request-Rate-Limiting, Bandbreitenbegrenzung, mTLS, SSO/Auth-Requests, ModSecurity, Asset-only Proxy-Cache, HTTP/2-Upstream für HTTP/HTTPS-Backends, Load-Balancing-Upstreams und optionale Deaktivierung von Proxy-Buffering.
- `_proxy_host_custom_location.conf` nutzt bei HTTP/HTTPS-Custom-Locations ebenfalls den Asset-only Proxy-Cache, wenn `caching_enabled` aktiv ist.
- Globale Funktionen wie `http2 on`, `http3 on`, `quic_gso`, `quic_retry`, persistenter `quic_host_key`, TLS-Cipher/ML-KEM-Kurve, Zertifikatskompression, Gzip/Brotli/Zstd, `early_hints`, Cache-Zonen, 0-RTT-Replay-Schutz-Maps und die Root-`nginx.conf` liegen im separaten `shieldpm-nginx`-Repository. ShieldPM nutzt diese Basis über `FROM ghcr.io/shedowe19/shieldpm-nginx:master`.

## Upstream-Features

- `upstream_servers` wird als JSON-Array aus dem Proxy-Host-Modell gerendert.
- Wenn das Array leer ist, bleiben `forward_scheme`, `forward_host` und `forward_port` das Ziel.
- Wenn das Array Einträge enthält, rendert `proxy_host.conf` einen Nginx-`upstream`-Block und `_proxy_logic.conf` leitet Default-Location-Traffic an diesen Block.
- `load_balancing_method` steuert die Methode. `round_robin` ist der Default und erzeugt keine zusätzliche Direktive.
- `upstream_http_version = "2"` setzt für HTTP/HTTPS-Backends `proxy_http_version 2` und leert `Upgrade`/`Connection`, weil WebSocket-Hop-by-Hop-Header nicht zum HTTP/2-Upstream passen.
- Für `grpc`/`grpcs` verwendet das Template weiterhin `grpc_pass`; dort ist HTTP/2 protokollbedingt bereits Teil des gRPC-Transports.

## TLS 1.3 0-RTT

- `ssl_early_data` ist ein Proxy-Host-Flag und wird nur bei Hosts mit TLS-Zertifikat wirksam.
- Bei aktivem Flag schreibt `_common.conf` `ssl_early_data on`.
- Die Root-`nginx.conf` definiert `$shieldpm_reject_early_data`, damit unsafe Early-Data-Requests mit `425` abgewiesen werden.
- Der Header `Early-Data` wird bereits über `proxy-headers.conf`/`grpc-headers.conf` an Upstreams weitergegeben.

## Asset-Cache

- `caching_enabled` aktiviert für HTTP/HTTPS-Proxy-Locations `proxy_cache shieldpm_asset_cache`.
- Die Cache-Zone `shieldpm_asset_cache` wird in der Root-`nginx.conf` des `shieldpm-nginx`-Images definiert und durch `rootfs/usr/local/bin/start.sh` aktiviert.
- Gecacht werden nur typische statische Assets anhand von Dateiendungen (`css`, `js`, Bilder, Fonts, `wasm`, Video-Dateien). Der Map-Wert `$shieldpm_no_cache` verhindert Full-Page-Caching für andere Pfade.
- Autorisierte Requests und explizite No-Cache-Signale (`Authorization`, Cookie/Query `nocache`) umgehen den Cache.
- Der Header `X-ShieldPM-Cache` zeigt den Nginx-Cache-Status (`HIT`, `MISS`, `BYPASS`, usw.).

## Offene Fragen

- TODO: Prüfen, ob zusätzlich ein UI-Element für Cache-TTL, Cache-Größe oder Purge-Aktionen benötigt wird.

## Verwandte Seiten

- [Nginx-Engine](../module/nginx-engine.md)
- [Proxy-Host](../module/proxy-host.md)
- [Analytics](./analytics.md)
- [Stream](../module/stream.md)
- [Offene Fragen](../offene-fragen.md)
