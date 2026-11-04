# Offene Fragen

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Sammelseite für **bereichsübergreifende** Fragen, die Auswirkungen auf Arbeit oder
Dokumentation haben und nicht aus dem Code beantwortet werden können. Die
Detailfrage steht auf der jeweiligen Seite; hier steht der Stand und der Weg zur
Klärung.

## Aus der Tiefendoku

Diese Punkte bleiben offen. Prüfstelle und Entscheidung sind jeweils genannt.

| Frage                                                                                                                   | Prüfstelle                                                                 | Was sie schließt                    |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------- |
| OpenAppSec-Policy des nativen Installers passt nicht zum Agent-Schema ([OpenAppSec](../reference/module/openappsec.md)) | `scripts/install.sh`, `open-appsec-ctl --apply-policy`                     | Policy wird ohne Schemafehler aktiv |
| Advanced-Modell im Native-/LXC-Pfad ist nicht nachgewiesen ([OpenAppSec](../reference/module/openappsec.md))            | `/advanced-model`, Agent-Neustart                                          | Modell lädt im Agent                |
| Kein End-to-End-Beispiel für Authentik (`AUTHENTIK_PROXY`) ([OAuth2-Proxy](../reference/module/oauth2-proxy.md))        | `frontend/src/modals/AccessListSsoTab.tsx`, `AccessListModalFormValues.ts` | lauffähiges Beispiel dokumentiert   |
| Weitere CDN-Quellen für IP-Ranges ([IP-Ranges](../reference/module/ip-ranges.md))                                       | `internal/ip_ranges.js`                                                    | Quelle ergänzt oder verworfen       |
| Swagger deckt Analytics, OIDC, GitOps, Upload-Relay nicht ab ([API-Schemas](../api/schemas.md))                         | `backend/schema/swagger.json`                                              | **Aufgabe: T-004**                  |

## Aus diesem Wiki

| Frage                                                                        | Prüfstelle                                                                         | Entscheidung                                                                |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Haben Tiefendoku und `docs/wiki/` denselben Release-Zyklus?                  | `.github/workflows/wiki-sync.yml` (nur `docs/wiki/**`)                             | Fakt: getrennte Zyklen; offen ist nur die Kennzeichnung in der Anwenderdoku |
| Wird `DATA_PATH` für native Installationen unterstützt?                      | Backend nutzt es teils, Nginx-Vhost-/TLS-Pfade sind fest, Installer setzt es nicht | Policy festlegen oder ausschließen                                          |
| Soll die Berechtigungsprüfung in Routen und Diensten vereinheitlicht werden? | `backend/routes/**`, `backend/lib/access.js`                                       | eine Schicht als verbindlich festlegen                                      |
| Sollen alle vier Hosttypen Revisionen und Rollback nutzen?                   | `internal/host-revisions.js`, Host-Dienste                                         | Umfang festlegen                                                            |
| Ist der 1-Sekunden-Neustart bei Startfehlern gewollt?                        | `backend/index.js:118-121`                                                         | beibehalten oder Healthcheck-Fehler                                         |
| Wird `host-traffic-policy` ein eigenständiges Modul?                         | `internal/host-traffic-policy.js`, `routes/nginx/host_traffic_policy.js`           | Route und Doku zusammenführen oder trennen                                  |

## Entscheidungsbedarf

- Sollen die veralteten Policy-Aussagen in `AGENTS.md` und `.cursorrules`
  korrigiert werden? Sie widersprechen dem Code
  ([Widersprüche](../contradictions/README.md)). Eine Korrektur ist eine
  Dokumentationsänderung, keine Code-Änderung.

## Verwandte Seiten

- [Index](../index.md)
- [Aufgaben](../tasks.md)
- [Widersprüche](../contradictions/README.md)
- [Tiefendoku: offene Fragen](../reference/offene-fragen.md)
