# Nginx Config Templates

## Zweck

Dokumentation der EJS-Templates für Nginx-Konfigurationsdateien.

## Kontext

Die Templates werden von `nginx.js` gerendert und nach `/data/nginx/` geschrieben.

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

| Datei            | Zweck                                 |
| ---------------- | ------------------------------------- |
| `_common.conf`   | Gemeinsame Konfiguration (Logs, etc.) |
| `default.conf`   | Default-Server (unbekannte Hosts)     |
| `ip_ranges.conf` | Cloudflare IP-Ranges (GeoIP)          |

## Template-Engine

- **Primär**: EJS-Syntax (`<%= %>`, `<% if () { } %>`)
- **Fallback**: Liquid-Syntax (`{% if %}`)
- Engine: `lib/utils.js` → `getRenderEngine()`

## Verwandte Seiten

- [Nginx-Engine](../module/nginx-engine.md)
- [Proxy-Host](../module/proxy-host.md)
- [Stream](../module/stream.md)
