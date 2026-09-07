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
- Die TOML-Konfiguration maskiert Zeichenketten und schreibt Listen als jeweils einen Array-Wert. Absolute Login-Weiterleitungen werden ausschließlich für Domains der zugeordneten, aktivierten Proxy-Hosts zugelassen; E-Mail-Domains sind davon unabhängig. Ohne solche Hosts ist die Weiterleitungsliste leer, statt den nicht ausgewerteten Nginx-Ausdruck `$host` zu enthalten.
- Konfigurationsdateien mit Client- und Cookie-Secrets erhalten Modus `0600`. Für `keycloak-oidc` wird wie für `oidc` die Issuer-URL geschrieben.
- Abstürze lösen maximal drei verzögerte Startversuche aus. Stoppen und Ersetzen eines Prozesses verwirft alte Startversuche; verspätete Exit-Ereignisse alter Prozesse können einen Ersatzprozess nicht aus der Verwaltung entfernen. Ein Stopp während asynchroner Vorbereitung verhindert dessen anschließenden Start.
- Konfigurationsschreibvorgänge und Starts werden pro Access-List nacheinander ausgeführt. Ein älterer Start kann deshalb keine bereits verwendete neuere Konfiguration überschreiben. Stoppen wartet außerdem auf den Prozess-Exit; nach fünf Sekunden folgt `SIGKILL`, und bei weiterhin fehlendem Exit wird kein Ersatz gestartet.
- Änderungen an Hostdomains, Aktivierung, Deaktivierung, Access-List-Zuordnung und Löschen aktualisieren die Weiterleitungsdomains. Ohne verbleibenden aktivierten Host wird der zugehörige Prozess beendet.
- Die Bereinigung beim Backendstart adressiert nur Prozesse mit der eigenen `--config=<DATA_PATH>/access/oauth2/<id>/oauth2-proxy.cfg`-Argumentzeile.

## Konfiguration

- Provider, Client-ID, Cookie-Secret etc. werden pro Access-List in `meta.oauth2_*` gespeichert.
- Geheime Werte (`oauth2_client_secret`, `oauth2_cookie_secret`) werden **nicht** im Wiki dokumentiert (siehe [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)).
- Ist nur `oauth2_allowed_emails` gesetzt, wird die Domainliste nicht automatisch auf `*` erweitert. Eine ausdrücklich konfigurierte Domainliste gilt zusätzlich zur Datei mit erlaubten E-Mail-Adressen.

### Regressionstests

`backend/test/internal/oauth2-proxy.spec.js` prüft TOML-Maskierung, mehrere Weiterleitungsdomains, Keycloak-Issuer, Dateirechte, verworfene Wiederholungen und konkurrierende Prozessereignisse mit simulierten Subprozessen.

### Unterstützte Provider

In `frontend/src/modals/AccessListModal.tsx` als Auswahl-Optionen verdrahtet, in der oauth2-proxy-Konfiguration als `provider = "<wert>"` gesetzt:

| Wert            | Anzeige        | Hinweis                                |
| --------------- | -------------- | -------------------------------------- |
| `google`        | Google         | Standard, falls `oauth2_provider` leer |
| `github`        | GitHub         |                                        |
| `oidc`          | OpenID Connect | benötigt `oauth2_oidc_issuer_url`      |
| `gitlab`        | GitLab         |                                        |
| `azure`         | Azure          |                                        |
| `keycloak-oidc` | Keycloak       |                                        |

Authentik wird **nicht** über oauth2-proxy, sondern als eigener Auth-Typ `AUTHENTIK_PROXY` (Feld `authentik_host`) integriert — er nutzt Authentiks eigenen Forward-Auth-Modus.

## Abhängigkeiten

- `internal/nginx.js` — Reload nach Konfigurationsänderung
- `internal/setting.js` — Globale OAuth2-Proxy-Einstellungen
- `internal/audit-log.js` — Protokollierung

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Benutzer & Auth](./benutzer-auth.md)
- [Proxy-Host](./proxy-host.md)
- [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)
- [Modulübersicht](./README.md)

## Zusätzliche Lebenszyklusabsicherung

Auch ein expliziter `stop()` läuft in derselben Liste-Warteschlange wie `start()`. Ein unmittelbar folgender Start wartet auf das Ende des bisherigen Socketbesitzers. Beim Backendstart zählen ausschließlich aktivierte Hosts. Bestehende Dateien mit erlaubten E-Mail-Adressen werden ebenfalls auf `0600` gesetzt. Präfixe ohne abschließenden Slash werden in Nginx und OAuth2-Proxy einheitlich ergänzt.
