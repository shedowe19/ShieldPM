# Express-Middleware

## Zweck

Die Middleware in `backend/app.js` und `backend/lib/express/` schützt und verarbeitet HTTP-Anfragen vor den eigentlichen API-Routen.

## Middleware-Dateien

| Datei                | Zweck                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `jwt.js`             | Bearer-Token oder `shieldpm_jwt`-Cookie nach `res.locals.token` übernehmen                            |
| `jwt-decode.js`      | `Access` mit Token-, Kontostatus- und Scope-Prüfung laden und unter `res.locals.access` bereitstellen |
| `demo.js`            | Demo-Modus-Beschränkungen für Änderungen und Netzwerkziele anwenden                                   |
| `user-id-from-me.js` | `:user_id=me` durch die ID des authentifizierten Benutzers ersetzen                                   |

## Reihenfolge in `app.js`

1. Helmet und das globale IP-Limit laufen vor Datenbankabfragen, CSRF-Erzeugung und Body-Parsing.
2. Cookie-Parser und `jwt.js` übernehmen Authentifizierungsdaten. Die Routen verwenden `jwt-decode.js` bei geschützten Endpunkten für die eigentliche Berechtigungsprüfung.
3. Die Double-Submit-CSRF-Middleware prüft schreibende Anfragen. Eine Ausnahme für die Erstregistrierung gibt es nur für `POST /users` beziehungsweise `POST /api/users`, solange keine Benutzer existieren. Login, Refresh, Logout und bestimmte 2FA-Prüfungen haben gezielte Ausnahmen; die Duo-Browserübergabe benötigt CSRF.
4. Der Health-Endpunkt liefert einen anonymen CSRF-Token; nach Login oder Refresh wird ein zur neuen Identität passender Token ausgegeben. Danach folgen Body-Parser, Demo-Middleware, Swagger und die Routen.
5. Die zentrale Fehlerbehandlung formatiert Fehler unter `error`. Sie kennzeichnet nur eine CSRF-Ablehnung vor Routenausführung mit `error.reason: "EBADCSRFTOKEN"`.

Der Konfigurations-Fingerabdruck wird bei der Hostregeneration vollständig geschrieben, bevor der Start als abgeschlossen gilt; das ist keine Express-Middleware.

## Verwandte Seiten

- [Backend-Hilfsbibliotheken](./backend-lib.md)
- [Benutzer & Auth](../module/benutzer-auth.md)
- [API-Überblick](../api/ueberblick.md)
