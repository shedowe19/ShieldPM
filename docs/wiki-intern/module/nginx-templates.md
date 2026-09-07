# Nginx Config Templates

## Zweck

Dokumentation der Liquid-Templates für Nginx-Konfigurationsdateien.

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

- **Engine**: LiquidJS mit Liquid-Syntax (`{{ value }}`, `{% if %}`); es gibt keinen EJS-Fallback.
- Engine: `lib/utils.js` → `getRenderEngine()`

## Geprüfte Sonderfälle

- Custom-Root-Locations ersetzen die Standard-Root-Location; Slash-Redirects und `alias` werden anhand der tatsächlichen letzten Zeichen bestimmt.
- Streams unterscheiden bei TLS zwischen Let's Encrypt, interner CA und importierten Zertifikaten.
- Terminal-WebSockets übernehmen die Host-Authentifizierung. Der Anubis-OIDC-Pfad enthält keine Ausnahme für `/ws`; die Weitergabe an das Backend verwendet ein hostgebundenes internes Token.

## Verwandte Seiten

- [Nginx-Engine](../module/nginx-engine.md)
- [Proxy-Host](../module/proxy-host.md)
- [Stream](../module/stream.md)
