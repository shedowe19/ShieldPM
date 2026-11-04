# API: Überblick

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Diese Seite beschreibt die REST-Konventionen der ShieldPM-API: Präfix, Auth,
Fehlerformat, Versionierung und Dokumentation. Sie ist die Grundlage für jede
Änderung an Routen.

## Was existiert

- Express-Router: `backend/routes/main.js` mountet alle Unter-Router.
- Basis-URL im Browser: `https://<host>:81/api/...`; Nginx entfernt `/api` vor
  dem Unix-Socket, daher behandeln Sicherheits-Ausnahmen beide Formen.
- OpenAPI: `backend/schema/swagger.json`, kompiliert über
  `backend/schema/index.js`, sichtbar unter `/docs`.

## Konventionen

| Thema       | Regel                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth        | Bearer-JWT oder Cookie `shieldpm_jwt`; `jwt()` setzt `res.locals.token`, das je Route eingehängte `jwtdecode()` daraus `res.locals.access` |
| CSRF        | Header `x-xsrf-token` passend zum Cookie `XSRF-TOKEN`                                                                                      |
| Validierung | JSON Schema (AJV) vor der Fachlogik                                                                                                        |
| Fehler      | `{ error: { code, message, message_i18n? } }`                                                                                              |
| Pagination  | `expand`, `query`, optional `page`/`limit` (Proxy-Hosts)                                                                                   |
| 404         | Alle unbekannten Pfade enden in `ItemNotFoundError` (`routes/main.js:98-101`)                                                              |
| Demo-Modus  | `checkDemoMode` sperrt ausgewählte Admin-Bereiche und prüft Host-Payloads; kein globaler Schreibschutz                                     |

## Authentifizierung und Sitzungen

- `POST /api/tokens` (Login), `/api/tokens/refresh`, `/api/tokens/logout`.
- 2FA: `/api/tokens/2fa/...` inklusive TOTP, Passkey, Duo und Backup-Codes;
  Duo nutzt `begin`/`complete`-Endpunkte.
- Browser-Sitzungen: `/api/tokens/sessions` (auflisten, widerrufen).
- OIDC: `/api/oidc` mit öffentlichen Einstellungen und Callback.
- Benutzer: `/api/users`, Rechte: `/api/users/:id/permissions`.
- 2FA-Verwaltung: `/api/users/:user_id/2fa`.

## Daten- und Administrationsendpunkte

- Einstellungen: `/api/settings`
- Audit-Log: `/api/audit-log`
- System-Reports: `/api/reports`
- Analytics: `/api/analytics` und `/api/nginx/analytics`
- Störungszentrale: `/api/incidents`
- Instanzbackups: `/api/backups`
- Dashboard: `/api/dashboard`
- Diensterkennung: `/api/services`
- Version: `/api/version`
- Schema: `/api/schema`

## Integrationen

- AI-Agent: `/api/ai`
- ChatOps: `/api/chat`
- GitOps: `/api/gitops`
- Nginx-Hosts: `/api/nginx/*` (siehe [Endpunkte](./endpoints.md))

## Risiken und Stolperfallen

- Ein neuer Endpunkt ohne Eintrag in `backend/lib/access/` schlägt bei der
  Berechtigungsprüfung fehl.
- CSRF gilt für alle nicht ausgenommenen Methoden; `GET`, `HEAD` und `OPTIONS`
  sind ausgenommen (`backend/app.js:184`).
- `strict routing` ist aktiv: ein abschließender Slash ändert die Route.
- Swagger beschreibt nicht alle Endpunkte (bekannte Lücke, siehe
  [offene Fragen](../questions/open-questions.md)).

## Offene Fragen

- Keine offenen Fragen auf dieser Seite; die frühere Swagger-Lücke ist mit
  `T-004` geschlossen.

## Verwandte Seiten

- [Endpunkte](./endpoints.md)
- [Schemas](./schemas.md)
- [Request-Lebenszyklus](../architecture/request-lifecycle.md)
- [Sicherheit](../security/overview.md)
- [API-Überblick (Tiefe)](../reference/api/ueberblick.md)
- [Routen (Tiefe)](../reference/api/routen.md)
