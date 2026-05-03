# OAuth2-Proxy (SSO)

## Zweck

Integration mit [oauth2-proxy](https://github.com/oauth2-proxy/oauth2-proxy) für externes Single-Sign-On vor proxierten Diensten. Erlaubt es, geschützte Apps hinter einem zentralen Login-Provider (Google, GitHub, OIDC, Keycloak, Authentik, …) zu verbergen.

## Kontext

Während ShieldPM selbst per OIDC Login-fähig ist (siehe [Benutzer & Auth](./benutzer-auth.md)), nutzt OAuth2-Proxy die `auth_request`-Mechanik von Nginx, um Backend-Anwendungen vor unauthentifiziertem Zugriff zu schützen — ohne diese App-seitig zu modifizieren.

## Wichtige Dateien

- `backend/internal/oauth2-proxy.js` (~240 Zeilen) — Konfiguration und Lebenszyklus
- `backend/templates/_proxy_logic.conf` — `auth_request`-Direktiven für Proxy-Hosts
- `backend/migrations/*` — Felder für OAuth-Konfiguration in Proxy-Hosts/Settings
- `frontend/src/pages/Settings/` — UI-Konfiguration (sofern aktiviert)

## Verhalten

- ShieldPM startet/konfiguriert oauth2-proxy als Sidecar-Service oder Subprozess (je nach Deployment).
- Pro Proxy-Host kann SSO aktiviert werden; Nginx prüft Cookies und weist anonyme Anfragen zur Login-Seite des Providers.
- Nach erfolgreicher Anmeldung erhält der Backend-Host Identity-Header (`X-Auth-Request-Email`, `X-Auth-Request-User`).

## Konfiguration

- Provider, Client-ID, Cookie-Secret etc. werden pro Access-List in `meta.oauth2_*` gespeichert.
- Geheime Werte (`oauth2_client_secret`, `oauth2_cookie_secret`) werden **nicht** im Wiki dokumentiert (siehe [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)).

### Unterstützte Provider

In `frontend/src/modals/AccessListModal.tsx` als Auswahl-Optionen verdrahtet, in der oauth2-proxy-Konfiguration als `provider = "<wert>"` gesetzt:

| Wert            | Anzeige        | Hinweis                                                    |
| --------------- | -------------- | ---------------------------------------------------------- |
| `google`        | Google         | Standard, falls `oauth2_provider` leer                     |
| `github`        | GitHub         |                                                            |
| `oidc`          | OpenID Connect | benötigt `oauth2_oidc_issuer_url`                          |
| `gitlab`        | GitLab         |                                                            |
| `azure`         | Azure          |                                                            |
| `keycloak-oidc` | Keycloak       |                                                            |

Authentik wird **nicht** über oauth2-proxy, sondern als eigener Auth-Typ `AUTHENTIK_PROXY` (Feld `authentik_host`) integriert — er nutzt Authentiks eigenen Forward-Auth-Modus.

## Abhängigkeiten

- `internal/nginx.js` — Reload nach Konfigurationsänderung
- `internal/setting.js` — Globale OAuth2-Proxy-Einstellungen
- `internal/audit-log.js` — Protokollierung

## Offene Fragen

- TODO: End-to-End-Beispiel mit Authentik dokumentieren (Auth-Typ `AUTHENTIK_PROXY` ist parallel zu oauth2-proxy verfügbar)

## Verwandte Seiten

- [Benutzer & Auth](./benutzer-auth.md)
- [Proxy-Host](./proxy-host.md)
- [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)
- [Modulübersicht](./README.md)
