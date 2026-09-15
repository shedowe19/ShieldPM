# Laufzeit-Endpunkt-Katalog

## Zweck

Dieser Katalog beschreibt alle fachlichen HTTP-Flächen, die im aktuellen Route-Mounting erreichbar sind. Er ergänzt
den veröffentlichten OpenAPI-Vertrag: `backend/schema/swagger.json` dokumentiert viele Ressourcen, aber nicht jeden
Route-Handler. Für eine Änderung an einem Endpunkt müssen immer der Handler, bei vorhandenem Vertrag die Schema-Datei
und diese Navigationsseite zusammen geprüft werden.

## Pfadkonvention und Quellen

Die Tabellen verwenden den externen Pfad mit dem Präfix `/api`. Die Router werden in
`backend/routes/main.js` relativ gemountet; Nginx leitet API-Anfragen im normalen Deployment an diese Anwendung weiter.
Parameter tragen in Handlern teilweise andere Namen als im OpenAPI-Dokument, etwa `:host_id` statt `{hostID}`. Die
Parameter bezeichnen dieselbe Ressource; für die genaue Validierung ist der Handler maßgeblich.
Die wichtigsten Quellen sind:

- `backend/routes/main.js` — vollständige Mount-Tabelle.
- `backend/routes/**/*.js` — Methoden, Berechtigungen und Laufzeitverhalten.
- `backend/schema/swagger.json` plus `backend/schema/paths/` — veröffentlichter OpenAPI-Teil.
- `backend/app.js` — globale Header-, Token-, CSRF-, Rate-Limit- und Dokumentations-Middleware.

## Bootstrap und API-Dokumentation

| Methode | Pfad                     | Zweck                                                         | Vertrag             |
| ------- | ------------------------ | ------------------------------------------------------------- | ------------------- |
| `GET`   | `/api/`                  | Health, Setup-Status, Version, Demo-Status und CSRF-Bootstrap | OpenAPI             |
| `GET`   | `/api/schema`            | aufgelöste OpenAPI-Spezifikation                              | OpenAPI             |
| `GET`   | `/api/docs`              | Swagger UI                                                    | Laufzeit-Middleware |
| `GET`   | `/api/docs/swagger.json` | roher, aufgelöster Swagger-Export                             | Laufzeit-Middleware |

## Anmeldung, Sitzung und Identität

| Methoden                | Pfad oder Pfadgruppe                                               | Zweck                                                                       | Vertrag                                        |
| ----------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------- |
| `GET`, `POST`, `DELETE` | `/api/tokens`                                                      | Legacy-Refresh, Passwortanmeldung und Tokenoperationen                      | OpenAPI für `GET`/`POST`; `DELETE` nur Handler |
| `POST`                  | `/api/tokens/refresh`, `/api/tokens/logout`, `/api/tokens/restore` | Tokenrotation, Abmeldung und Rückkehr aus administrativer Benutzerübernahme | Refresh/Logout OpenAPI, Restore nur Handler    |
| `POST`                  | `/api/tokens/2fa/verify`                                           | Abschluss einer ausstehenden zweiten Anmeldung                              | OpenAPI                                        |
| `POST`                  | `/api/tokens/2fa/passkey/begin`, `/complete`                       | Passkey-Anmeldung                                                           | OpenAPI                                        |
| `POST`                  | `/api/tokens/2fa/duo/begin`, `/complete`                           | Duo-Anmeldung mit browsergebundener Übergabe                                | nur Handler                                    |
| `GET`                   | `/api/oidc`, `/api/oidc/callback`                                  | OIDC Authorization-Code-Start und Callback                                  | nur Handler                                    |
| `POST`                  | `/api/oidc/claim`                                                  | OIDC-Übergabe in ein reguläres Tokenpaar übernehmen                         | nur Handler                                    |
| `GET`, `POST`, `DELETE` | `/api/users`                                                       | Benutzerliste, Anlage und Route-spezifische Verwaltungsaktion               | OpenAPI für `GET`/`POST`; `DELETE` nur Handler |
| `GET`, `PUT`, `DELETE`  | `/api/users/:user_id`                                              | einzelner Benutzer                                                          | OpenAPI                                        |
| `PUT`                   | `/api/users/:user_id/auth`, `/permissions`                         | Passwort- und Rechteverwaltung                                              | OpenAPI                                        |
| `POST`                  | `/api/users/:user_id/login`                                        | administrativer Login als Benutzer                                          | OpenAPI                                        |
| `POST`                  | `/api/users/:user_id/avatar`                                       | Avatar hochladen                                                            | nur Handler                                    |
| `GET`                   | `/api/users/:user_id/avatar/image`                                 | öffentlich abrufbares Avatarbild mit eigenem Limit                          | nur Handler                                    |

### Verwaltete 2FA-Methoden

Diese Pfade liegen unter `/api/users/:user_id/2fa` und erfordern den Benutzer selbst oder eine dafür berechtigte
Administration. Sie sind derzeit nicht vollständig als OpenAPI-Pfade veröffentlicht.

| Methoden      | Suffix                                                  | Zweck                                       |
| ------------- | ------------------------------------------------------- | ------------------------------------------- |
| `GET`         | `/`                                                     | aktive Methoden und verfügbare Backup-Codes |
| `POST`        | `/totp/setup`, `/totp/enable`                           | TOTP vorbereiten und aktivieren             |
| `POST`        | `/yubikey/add`                                          | YubiKey-OTP registrieren                    |
| `POST`        | `/passkey/register/begin`, `/passkey/register/complete` | Passkey registrieren                        |
| `POST`        | `/duo/setup`                                            | Duo-Methode konfigurieren                   |
| `DELETE`      | `/:methodId`                                            | konkrete Methode entfernen                  |
| `GET`, `POST` | `/backup-codes/count`, `/backup-codes/regenerate`       | Restmenge lesen und Codes neu erzeugen      |

Die gemeinsame Sicherheitsgrenze und Cookie-Regeln erklärt [Benutzer & Auth](../module/benutzer-auth.md).

## Verwaltung, Integrationen und Analyse

| Methoden                       | Pfad oder Pfadgruppe                                                                         | Zweck                                                | Vertrag                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| `GET`, `PUT`                   | `/api/settings`, `/api/settings/:setting_id`                                                 | globale Einstellungen und einzelne Einstellungswerte | OpenAPI                                                |
| `GET`                          | `/api/audit-log`, `/api/audit-log/:event_id`                                                 | Audit-Ereignisse                                     | OpenAPI                                                |
| `GET`                          | `/api/reports/hosts`                                                                         | Host-Report                                          | OpenAPI                                                |
| `GET`                          | `/api/version/check`                                                                         | Versionsprüfung                                      | OpenAPI                                                |
| `GET`, `POST`, `PUT`, `DELETE` | `/api/chat`, `/api/chat/:id`                                                                 | ChatOps-Integrationen                                | OpenAPI mit abweichendem Parametername `integrationID` |
| `GET`, `POST`, `PUT`, `DELETE` | `/api/dashboard/notes`, `/api/dashboard/notes/:id`                                           | Dashboard-Notizen                                    | OpenAPI                                                |
| `GET`, `PUT`, `POST`           | `/api/ai/config`, `/api/ai/models`, `/api/ai/chat`                                           | AI-Konfiguration, Modellprüfung und Chat             | OpenAPI                                                |
| `GET`, `PUT`, `POST`           | `/api/gitops/config`, `/test`, `/export`, `/push`, `/pull`, `/history`, `/revert`, `/import` | GitOps-Konfiguration und Synchronisation             | nur Handler                                            |
| `GET`                          | `/api/services/icons`, `/api/services/detect`                                                | Service-Icon-Katalog und Port-/Hostname-Erkennung    | nur Handler                                            |
| `GET`                          | `/api/analytics/summary`, `/series`, `/top-hosts`, `/status`, `/db-stats`                    | globale Analytics mit `analytics:list`               | nur Handler                                            |
| `GET`                          | `/api/nginx/analytics/:hostId`, `/api/nginx/analytics/:hostId/summary`                       | hostbezogene Zeitreihe und Zusammenfassung           | nur Handler                                            |

Die Transportfunktionen für globale Serie und Zusammenfassung besitzen zusätzlich einen Fallback auf
`/api/nginx/analytics/global`. Dieser Pfad ist in der Mount-Tabelle nicht vorhanden; die Analytics-Seite ruft heute
nur mit einer Host-ID ab. Die Diskrepanz ist als Umsetzungs-TODO in [Offene Fragen](../offene-fragen.md) festgehalten
und gehört deshalb nicht zur Pfadliste.

## Nginx-Ressourcen und Aktionen

| Methoden                       | Pfadgruppe                                                                                               | Zweck                                                                                      | Vertrag                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `GET`, `POST`, `PUT`, `DELETE` | `/api/nginx/proxy-hosts` und `/:host_id`                                                                 | Proxy-Host-CRUD                                                                            | OpenAPI                                    |
| `POST`, `GET`, `PUT`           | `/api/nginx/proxy-hosts/:host_id/enable`, `/disable`, `/git-sync`, `/git-status`                         | Aktivierung und Git-Status/-Sync                                                           | OpenAPI                                    |
| `GET`, `POST`, `PUT`, `DELETE` | `/api/nginx/redirection-hosts` und `/:host_id`                                                           | Redirection-Host-CRUD                                                                      | OpenAPI                                    |
| `POST`                         | `/api/nginx/redirection-hosts/:host_id/enable`, `/disable`                                               | Aktivierung                                                                                | OpenAPI                                    |
| `GET`, `POST`, `PUT`, `DELETE` | `/api/nginx/dead-hosts` und `/:host_id`                                                                  | Dead-Host-CRUD                                                                             | OpenAPI                                    |
| `POST`                         | `/api/nginx/dead-hosts/:host_id/enable`, `/disable`                                                      | Aktivierung                                                                                | OpenAPI                                    |
| `GET`, `POST`, `PUT`, `DELETE` | `/api/nginx/streams` und `/:stream_id`                                                                   | TCP-/UDP-Stream-CRUD                                                                       | OpenAPI                                    |
| `POST`                         | `/api/nginx/streams/:stream_id/enable`, `/disable`                                                       | Aktivierung                                                                                | OpenAPI                                    |
| `GET`, `POST`, `PUT`, `DELETE` | `/api/nginx/access-lists` und `/:list_id`                                                                | Access-List-CRUD                                                                           | OpenAPI                                    |
| `GET`, `POST`, `PUT`, `DELETE` | `/api/nginx/certificates` und `/:certificate_id`                                                         | Zertifikats-CRUD                                                                           | OpenAPI                                    |
| `GET`, `POST`                  | `/api/nginx/certificates/root-ca`, `/dns-providers`, `/retrieve`, `/validate`, `/test-http`, `/download` | Hilfs- und Prüfoperationen                                                                 | teils OpenAPI, Root-CA nur Handler         |
| `POST`                         | `/api/nginx/certificates/internal/client`                                                                | internes Client-Zertifikat als passwortgeschützte PKCS#12-Datei erzeugen und herunterladen | nur Handler                                |
| `POST`                         | `/api/nginx/certificates/:certificate_id/renew`, `/:certificate_id/upload`                               | Erneuerung und Upload                                                                      | OpenAPI                                    |
| `GET`, `POST`, `PUT`, `DELETE` | `/api/nginx/cloudflared-tunnels` und `/:id`                                                              | Cloudflare-Tunnel                                                                          | OpenAPI                                    |
| `GET`, `POST`, `PUT`, `DELETE` | `/api/nginx/ddns-providers` und `/:id`                                                                   | DDNS-Provider                                                                              | OpenAPI                                    |
| `POST`                         | `/api/nginx/ddns-providers/:id/test`                                                                     | Provider-Verbindung testen                                                                 | OpenAPI                                    |
| `GET`, `POST`, `PUT`, `DELETE` | `/api/nginx/tor-onion` und `/:id`                                                                        | Tor-Onion-Service                                                                          | OpenAPI                                    |
| `POST`                         | `/api/nginx/tor-onion/:id/start`, `/:id/stop`                                                            | Tor-Service starten und stoppen                                                            | nur Handler                                |
| `GET`, `POST`, `PUT`, `DELETE` | `/api/nginx/wireguard` und `/:id`                                                                        | WireGuard-Peers                                                                            | OpenAPI                                    |
| `GET`, `PUT`                   | `/api/nginx/wireguard/status`, `/settings`                                                               | Interface-Status und globale Einstellungen                                                 | Status nur Handler, Settings teils OpenAPI |
| `POST`                         | `/api/nginx/wireguard/:id/enable`, `/:id/disable`                                                        | Peer aktivieren oder deaktivieren                                                          | nur Handler                                |
| `GET`                          | `/api/nginx/wireguard/:id/config`, `/:id/qrcode`                                                         | Peer-Konfiguration und QR-Code                                                             | nur Handler                                |

## Vollständige Pfadliste

Diese Liste hält die in `backend/routes/main.js` gemounteten Handlerpfade in ihrer aktuellen Schreibweise fest.
Sie ist für Quellenabgleich und LLM-Navigation gedacht; Methoden, Berechtigungen und Nutzlasten stehen in den
vorangehenden Tabellen und im jeweiligen Route-Handler.

```text
/api
/api/schema
/api/docs
/api/docs/swagger.json

/api/tokens
/api/tokens/2fa/duo/begin
/api/tokens/2fa/duo/complete
/api/tokens/2fa/passkey/begin
/api/tokens/2fa/passkey/complete
/api/tokens/2fa/verify
/api/tokens/logout
/api/tokens/refresh
/api/tokens/restore

/api/oidc
/api/oidc/callback
/api/oidc/claim

/api/users
/api/users/:user_id
/api/users/:user_id/auth
/api/users/:user_id/avatar
/api/users/:user_id/avatar/image
/api/users/:user_id/login
/api/users/:user_id/permissions
/api/users/:user_id/2fa
/api/users/:user_id/2fa/:methodId
/api/users/:user_id/2fa/backup-codes/count
/api/users/:user_id/2fa/backup-codes/regenerate
/api/users/:user_id/2fa/duo/setup
/api/users/:user_id/2fa/passkey/register/begin
/api/users/:user_id/2fa/passkey/register/complete
/api/users/:user_id/2fa/totp/enable
/api/users/:user_id/2fa/totp/setup
/api/users/:user_id/2fa/yubikey/add

/api/audit-log
/api/audit-log/:event_id
/api/reports/hosts
/api/settings
/api/settings/:setting_id
/api/version/check

/api/analytics/db-stats
/api/analytics/series
/api/analytics/status
/api/analytics/summary
/api/analytics/top-hosts

/api/ai/chat
/api/ai/config
/api/ai/models
/api/dashboard/notes
/api/dashboard/notes/:id
/api/chat
/api/chat/:id

/api/gitops/config
/api/gitops/export
/api/gitops/history
/api/gitops/import
/api/gitops/pull
/api/gitops/push
/api/gitops/revert
/api/gitops/test
/api/services/detect
/api/services/icons

/api/nginx/proxy-hosts
/api/nginx/proxy-hosts/:host_id
/api/nginx/proxy-hosts/:host_id/disable
/api/nginx/proxy-hosts/:host_id/enable
/api/nginx/proxy-hosts/:host_id/git-status
/api/nginx/proxy-hosts/:host_id/git-sync

/api/nginx/ddns-providers
/api/nginx/ddns-providers/:id
/api/nginx/ddns-providers/:id/test
/api/nginx/redirection-hosts
/api/nginx/redirection-hosts/:host_id
/api/nginx/redirection-hosts/:host_id/disable
/api/nginx/redirection-hosts/:host_id/enable
/api/nginx/dead-hosts
/api/nginx/dead-hosts/:host_id
/api/nginx/dead-hosts/:host_id/disable
/api/nginx/dead-hosts/:host_id/enable
/api/nginx/streams
/api/nginx/streams/:stream_id
/api/nginx/streams/:host_id/enable
/api/nginx/streams/:host_id/disable
/api/nginx/access-lists
/api/nginx/access-lists/:list_id

/api/nginx/certificates
/api/nginx/certificates/:certificate_id
/api/nginx/certificates/:certificate_id/renew
/api/nginx/certificates/:certificate_id/upload
/api/nginx/certificates/dns-providers
/api/nginx/certificates/download
/api/nginx/certificates/internal/client
/api/nginx/certificates/retrieve
/api/nginx/certificates/root-ca
/api/nginx/certificates/test-http
/api/nginx/certificates/validate

/api/nginx/analytics/:hostId
/api/nginx/analytics/:hostId/summary
/api/nginx/cloudflared-tunnels
/api/nginx/cloudflared-tunnels/:id
/api/nginx/tor-onion
/api/nginx/tor-onion/:id
/api/nginx/tor-onion/:id/start
/api/nginx/tor-onion/:id/stop
/api/nginx/wireguard
/api/nginx/wireguard/:id
/api/nginx/wireguard/:id/config
/api/nginx/wireguard/:id/disable
/api/nginx/wireguard/:id/enable
/api/nginx/wireguard/:id/qrcode
/api/nginx/wireguard/settings
/api/nginx/wireguard/status
```

## Vertragspflege und bekannte Grenze

`backend/schema/swagger.json` ist die veröffentlichte Spezifikation, aber keine automatisch aus den Express-Routen
generierte Gesamtliste. Insbesondere OIDC, GitOps, Service-Helfer, die vollständige 2FA-Verwaltung sowie mehrere
Analytics-, Tor- und WireGuard-Aktionen sind derzeit ausschließlich im Handler dokumentiert. Das ist für LLMs in
diesem Katalog sichtbar; bei einer externen API-Zusage muss zusätzlich entschieden werden, ob der OpenAPI-Vertrag
erweitert wird.

Für alle schreibenden Routen gelten die zentrale CSRF- und Berechtigungslogik aus `backend/app.js` sowie die
route-spezifischen Checks. Eine Tabellenzeile ersetzt deshalb nie die Prüfung des tatsächlichen Route-Handlers.

## Verwandte Seiten

- [API-Überblick](./ueberblick.md)
- [API-Routen](./routen.md)
- [API-Schemas](./schemas.md)
- [Benutzer & Auth](../module/benutzer-auth.md)
- [Quellabdeckung](../entwicklung/quellabdeckung.md)
- [Modulübersicht](../module/README.md)
