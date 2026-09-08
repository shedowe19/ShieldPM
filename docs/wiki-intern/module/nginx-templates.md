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

## Authentifizierung und Grenzfälle

- OIDC-Discovery-URL, Client-ID und Client-Secret werden als korrekt maskierte Lua-Zeichenketten ausgegeben. Anführungszeichen, Backslashes und Steuerzeichen bleiben Daten.
- Authentik-Outpost-Locations setzen `auth_request off`, damit sie nicht ihren eigenen Authentifizierungs-Unteraufruf erneut auslösen.
- mTLS verlangt für weitergeleitete Anfragen `$ssl_client_verify = SUCCESS`. Damit kann eine unverschlüsselte HTTP-Anfrage die Clientzertifikatsprüfung auch bei ausgeschaltetem SSL-Redirect nicht umgehen.
- Bandbreitenbegrenzung deklariert `$calculated_rate` auch im Standardserver; fehlendes Request-Burst-Limit wird zu `0`. Request-Limit-Schlüssel enthalten die Host-ID, damit verschiedene Hosts ihre Limits nicht teilen.
- Statische Hosts sperren `.git`-Verzeichnisse. Verwaltete Websitewurzeln verwenden zusätzlich `disable_symlinks on`. PHP-Programme bleiben ausführbarer, vertrauenswürdiger Anwendungscode; diese Nginx-Einstellung ist keine PHP-Sandbox.
- `X_FRAME_OPTIONS` wird im vorhandenen HSTS-Headerblock direkt aus der Umgebung gelesen, mit `SAMEORIGIN` als Standard.

## Statische Custom-Locations und Bandbreitenzähler

Auch statische Custom-Locations blockieren `.git` und sperren bei verwalteten Websitewurzeln Symlinks. Das gilt ebenso, wenn die Standard-Location einen HTTP-Upstream verwendet. Der Renderer berücksichtigt den exakten Wartungsbeginn einschließlich des Startzeitpunkts.

Die Lua-Logphase vermindert den Verbindungszähler nur für Anfragen, denen die Access-Phase tatsächlich Bandbreite zugeteilt hat. Frühe Redirects oder Ablehnungen ohne Zuteilung verändern laufende Übertragungen nicht mehr. Dies gilt im Standardserver sowie im öffentlichen Anubis-Server. Die Gegenprüfung mit Lua 5.4 reproduzierte das Fehlverhalten beider bisherigen Logblöcke und bestätigte anschließend sowohl den unveränderten Zähler ohne Zuteilung als auch die korrekte Freigabe einer zugeteilten Übertragung.
