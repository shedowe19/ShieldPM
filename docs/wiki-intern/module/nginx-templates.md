# Nginx Config Templates

## Zweck

Dokumentation der Liquid-Templates für Nginx-Konfigurationsdateien.

## Kontext

Die Templates werden von `nginx.js` gerendert und nach `/data/nginx/` geschrieben.

## Template-Dateien

### Proxy-Hosts

| Datei                              | Zweck                                                 |
| ---------------------------------- | ----------------------------------------------------- |
| `proxy_host.conf`                  | Haupt-Template für Proxy-Hosts                        |
| `_proxy_logic.conf`                | Gemeinsame Proxy-Logik (eingebettet)                  |
| `_proxy_host_custom_location.conf` | Partial für Custom-Locations (Liquid-Syntax)          |
| `_upload_relay.conf`               | Upload-Locations für generische und Nextcloud-Uploads |

### Spezial-Hosts

| Datei                   | Zweck                     |
| ----------------------- | ------------------------- |
| `redirection_host.conf` | 301/302 Umleitungen       |
| `dead_host.conf`        | 404 "Not Found" Hosts     |
| `stream.conf`           | TCP/UDP Stream-Forwarding |

### System

| Datei            | Zweck                                                   |
| ---------------- | ------------------------------------------------------- |
| `_common.conf`   | Gemeinsame Listener, TLS-, HSTS- und ACME-Konfiguration |
| `default.conf`   | Default-Server (unbekannte Hosts)                       |
| `ip_ranges.conf` | `set_real_ip_from` für konfigurierte Proxy-IP-Bereiche  |

## Template-Engine

- **Engine**: LiquidJS mit Liquid-Syntax (`{{ value }}`, `{% if %}`); es gibt keinen EJS-Fallback.
- Engine: `lib/utils.js` → `getRenderEngine()`

## Geprüfte Sonderfälle

- Custom-Root-Locations ersetzen die Standard-Root-Location; Slash-Redirects und `alias` werden anhand der tatsächlichen letzten Zeichen bestimmt.
- Streams unterscheiden bei TLS zwischen Let's Encrypt, interner CA und importierten Zertifikaten.
- Terminal-WebSockets übernehmen die Host-Authentifizierung. Der Anubis-OIDC-Pfad enthält keine Ausnahme für `/ws`; die Weitergabe an das Backend verwendet ein hostgebundenes internes Token.

## Authentifizierungsheader am Upstream

`_proxy_auth_headers.conf` setzt OAuth2-Identitätsheader, die bestehenden Authentik-Kontextheader und die optionale Entfernung des Basic-Auth-Headers direkt in der weiterleitenden Location. Nginx übernimmt `proxy_set_header` aus dem Serverblock nur, wenn die Location keine eigenen Headerdirektiven besitzt; die allgemeinen Proxy-Includes verhinderten deshalb zuvor diese Weitergabe. HTTP- und gRPC-Ziele verwenden jeweils ihre eigene Headerdirektive. Default- und Custom-Locations sowie Terminal-WebSockets werden berücksichtigt.

`pass_auth: true` entspricht der UI-Option „Pass Auth to Upstream“ und lässt den Authorization-Header passieren. Bei `false` wird er für Listen mit Basic-Auth-Einträgen entfernt. Die frühere umgekehrte Bedingung ist korrigiert.

Mit Anubis werden die vertrauenswürdigen Header am öffentlichen Server gesetzt. Der interne Server reicht diese weiter, statt sie durch leere Auth-Unteranfragewerte zu überschreiben. `fourth-proxy-auth-headers.spec.js` prüft die tatsächliche Liquid-Ausgabe einschließlich Headerplatzierung und beider Pass-Auth-Zustände; ein externer OAuth-Provider wird dabei nicht aufgerufen.

## IPv6-HTTP-Upstreams

HTTP-/HTTPS-Proxyziele werden beim Rendern über `nginxUpstreamHost` formatiert: echte rohe IPv6-Literale erhalten die für die URL erforderlichen eckigen Klammern. Bereits geklammerte Adressen, IPv4, Domains und Unix-Socket-Ziele bleiben unverändert. Das gilt für Standard- und Custom-Locations; der gespeicherte Host-Eingabewert wird nicht geändert. Regressionen prüfen die Liquid-Ausgabe und tatsächliche HTTP-/HTTPS-Weiterleitungen einschließlich URI und Query. Diese Formatierung ändert keine gRPC- oder Stream-Direktiven.

## gRPC-Zieladresse und Methodenpfad

Die automatisch erzeugte `grpc_pass`-Zieladresse erhält keinen angehängten `$request_uri`. Das Nginx-gRPC-Modul erwartet dort ausschließlich eine Serveradresse und übernimmt den Methodenpfad einschließlich Query selbst aus der Anfrage. Der frühere URI-Anhang führte erst beim tatsächlichen Aufruf zu `invalid host`, obwohl `nginx -t` die variable Direktive akzeptierte. Das gilt für Standard- und Custom-Locations sowie `grpc` und `grpcs`.

Explizite URI-Anteile im gRPC-Ziel bleiben vom Nginx-Modul nicht unterstützt; die Korrektur führt keine neue Rewrite- oder Präfixersetzungssemantik ein. `fifth-grpc-upstream-address.spec.js` prüft die tatsächliche Liquid-Ausgabe. Der Docker-Smoke startet zusätzlich einen isolierten Nginx-Prozess und einen lokalen Node-HTTP/2-Echodienst; zwei über die Image-Templates erzeugte gRPC-Weiterleitungen müssen POST, Methodenpfad, Query und gerahmten Body vollständig übertragen. Dieser Test benötigt keine externen Provider.

## TCP-Listener-Resilienz

Die HTTP-, HTTPS- und TCP-Stream-Templates verwenden für TCP kein `reuseport`. Mit `reuseport` erhält jeder Nginx-Worker einen eigenen TCP-Listening-Socket. Ein fehlerhafter Worker kann dadurch weiter neue Verbindungen zugeteilt bekommen, ohne sie zu bedienen. Geteilte TCP-Listener erlauben den verbleibenden gesunden Workern, neue Verbindungen weiter anzunehmen.

`deferred` und `so_keepalive=on` bleiben für TCP erhalten. UDP-Streams und QUIC/HTTP/3 behalten `reuseport`, weil diese UDP-Pfade andere Socket-Semantiken benötigen. Der Regressionstest `backend/test/internal/tcp-listener-stability.spec.js` schützt diese Trennung.

## Authentifizierung und Grenzfälle

- OIDC-Discovery-URL, Client-ID und Client-Secret werden als korrekt maskierte Lua-Zeichenketten ausgegeben. Anführungszeichen, Backslashes und Steuerzeichen bleiben Daten.
- Authentik-Outpost-Locations setzen `auth_request off`, damit sie nicht ihren eigenen Authentifizierungs-Unteraufruf erneut auslösen.
- Die statische `/.well-known/acme-challenge/`-Location deaktiviert Basic-Auth, `auth_request` und geerbte Lua-Accesshandler. Vorhandene HTTP-01-Dateien verlangen dadurch keine OAuth2-/Authentik-/OIDC-Anmeldung. Serverseitige mTLS-Ablehnung und erzwungene HTTPS-Weiterleitung bleiben bestehen; normale Proxy-Pfade behalten ihre Authentifizierung.
- mTLS verlangt für weitergeleitete Anfragen `$ssl_client_verify = SUCCESS`. Damit kann eine unverschlüsselte HTTP-Anfrage die Clientzertifikatsprüfung auch bei ausgeschaltetem SSL-Redirect nicht umgehen.
- Bandbreitenbegrenzung deklariert `$calculated_rate` auch im Standardserver; fehlendes Request-Burst-Limit wird zu `0`. Request-Limit-Schlüssel enthalten die Host-ID, damit verschiedene Hosts ihre Limits nicht teilen.
- Statische Hosts sperren `.git`-Verzeichnisse. Verwaltete Websitewurzeln verwenden zusätzlich `disable_symlinks on`. PHP-Programme bleiben ausführbarer, vertrauenswürdiger Anwendungscode; diese Nginx-Einstellung ist keine PHP-Sandbox.
- `X_FRAME_OPTIONS` wird im vorhandenen HSTS-Headerblock direkt aus der Umgebung gelesen, mit `SAMEORIGIN` als Standard.

Öffentliche Firewalltexte und die Sperrseitenvorlage verwenden `luaPageString` mit höchstens 250 Unicode-Codepoints je Lua-Literal. Auch nach UTF-8-Kodierung und dezimalem Escaping beträgt die maximale Tokenlänge 1002 Bytes. Das verhindert Parserfehler bei gültigen langen Gründen, Listennamen, Nachrichten und Kontaktlinks, ohne den dekodierten Inhalt oder die anschließende HTML-/JSON-Maskierung zu verändern. Der native Firewall-Smoke prüft diese Texte sowie echte statische ACME-Dateien unter lokalen Auth-Stubs; `return 200` wird für diese Challenge-Regression nicht verwendet.

Die isolierte ACME-Redirect-Testkonfiguration verwendet private `spm_smoke_acme_port*`-Variablen als Port-Platzhalter. Damit überschreibt der Test nicht die im ShieldPM-Nginx bereits vorhandenen Portvariablen und bleibt zugleich mit portablem Nginx kompatibel. Diese CI-Fixture-Korrektur verändert weder die produktive `_common.conf` noch das Redirectverhalten.

## Statische Custom-Locations und Bandbreitenzähler

Auch statische Custom-Locations blockieren `.git` und sperren bei verwalteten Websitewurzeln Symlinks. Das gilt ebenso, wenn die Standard-Location einen HTTP-Upstream verwendet. Der Renderer berücksichtigt den exakten Wartungsbeginn einschließlich des Startzeitpunkts.

Die Lua-Logphase vermindert den Verbindungszähler nur für Anfragen, denen die Access-Phase tatsächlich Bandbreite zugeteilt hat. Frühe Redirects oder Ablehnungen ohne Zuteilung verändern laufende Übertragungen nicht mehr. Dies gilt im Standardserver sowie im öffentlichen Anubis-Server. Die Gegenprüfung mit Lua 5.4 reproduzierte das Fehlverhalten beider bisherigen Logblöcke und bestätigte anschließend sowohl den unveränderten Zähler ohne Zuteilung als auch die korrekte Freigabe einer zugeteilten Übertragung.

## Verwandte Seiten

- [Nginx-Engine](../module/nginx-engine.md)
- [Proxy-Host](../module/proxy-host.md)
- [Stream](../module/stream.md)
