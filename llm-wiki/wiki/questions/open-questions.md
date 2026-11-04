# Offene Fragen

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Sammelseite für **alle offenen** Fragen, die Auswirkungen auf Arbeit oder
Dokumentation haben. Jede Zeile nennt eine Prüfstelle und was die Klärung
abschließt; Detailfragen stehen auf der verlinkten Seite.

## Offene Fragen

| Frage                                                                                                                       | Prüfstelle                                                                         | Was sie schließt                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| OpenAppSec-Policy des nativen Installers gegen den laufenden Agent prüfen ([OpenAppSec](../reference/module/openappsec.md)) | `open-appsec-ctl --apply-policy` auf einer laufenden Instanz                       | **Aufgabe: T-005** (Policy entspricht v1beta1, Live-Beleg fehlt) |
| Advanced-Modell im Native-/LXC-Pfad ist nicht nachgewiesen ([OpenAppSec](../reference/module/openappsec.md))                | `/advanced-model`, Agent-Neustart                                                  | Modell lädt im Agent                                             |
| Kein End-to-End-Beispiel für Authentik (`AUTHENTIK_PROXY`) ([OAuth2-Proxy](../reference/module/oauth2-proxy.md))            | `frontend/src/modals/AccessListSsoTab.tsx`, `AccessListModalFormValues.ts`         | lauffähiges Beispiel dokumentiert                                |
| Weitere CDN-Quellen für IP-Ranges ([IP-Ranges](../reference/module/ip-ranges.md))                                           | `internal/ip_ranges.js`                                                            | Quelle ergänzt oder verworfen                                    |
| Wird `DATA_PATH` für native Installationen unterstützt?                                                                     | Backend nutzt es teils, Nginx-Vhost-/TLS-Pfade sind fest, Installer setzt es nicht | Policy festlegen oder ausschließen                               |
| Soll die Berechtigungsprüfung in Routen und Diensten vereinheitlicht werden?                                                | `backend/routes/**`, `backend/lib/access.js`                                       | eine Schicht als verbindlich festlegen                           |
| Sollen alle vier Hosttypen Revisionen und Rollback nutzen?                                                                  | `internal/host-revisions.js`, Host-Dienste (derzeit nur Proxy-Hosts)               | Umfang festlegen                                                 |
| Ist der 1-Sekunden-Neustart bei Startfehlern gewollt?                                                                       | `backend/index.js:118-121`                                                         | beibehalten oder Healthcheck-Fehler                              |
| Wird `host-traffic-policy` ein eigenständiges Modul?                                                                        | `internal/host-traffic-policy.js`, `routes/nginx/host_traffic_policy.js`           | Route und Doku zusammenführen oder trennen                       |
| Haben Tiefendoku und `docs/wiki/` denselben Release-Zyklus?                                                                 | `.github/workflows/wiki-sync.yml` (nur `docs/wiki/**`)                             | offen ist nur die Kennzeichnung in der Anwenderdoku              |

## Beantwortet

| Frage                                                      | Antwort                                       | Beleg                                     |
| ---------------------------------------------------------- | --------------------------------------------- | ----------------------------------------- |
| Ist der Unix-Socket bei nativen Installationen derselbe?   | Ja, `/run/shieldpm/shieldpm.sock`             | `scripts/install.sh:1065`, `start.sh:384` |
| Läuft GeoIP vor der Env-Validierung, mit Cache-Fallback?   | Ja; ohne vollständigen Cache stoppt der Start | `envs.sh:40`, `update-geoip.py:436-458`   |
| Deckt Swagger Analytics, OIDC, GitOps und Upload-Relay ab? | Ja, seit 2026-11-04                           | `backend/schema/swagger.json`, T-004      |

## Verwandte Seiten

- [Index](../index.md)
- [Aufgaben](../tasks.md)
- [Widersprüche](../contradictions/README.md)
- [Tiefendoku: offene Fragen](../reference/offene-fragen.md)
