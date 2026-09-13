# Express Middleware

## Zweck

Dokumentation der Express-Middleware in `backend/lib/express/`.

## Kontext

Diese Middleware wird von `backend/app.js` verwendet und bildet die HTTP-Request-Verarbeitungsschicht.

## Middleware-Dateien

| Datei                | Größe | Zweck                                      |
| -------------------- | ----- | ------------------------------------------ |
| `jwt.js`             | 352 B | JWT-Authentifizierungs-Middleware          |
| `jwt-decode.js`      | 553 B | JWT-Token aus Request dekodieren           |
| `demo.js`            | 5.8KB | Demo-Modus-Middleware (read-only Zugriff)  |
| `user-id-from-me.js` | 337 B | Ersetzt `me` in URL durch aktuelle User-ID |

## Verhalten

### jwt.js

Übernimmt einen Bearer-Token aus dem Authorization-Header oder das `shieldpm_jwt`-Cookie nach `res.locals.token`. Die eigentliche Prüfung erfolgt im Access-Layer.

### jwt-decode.js

Erzeugt und lädt `Access`, einschließlich Token-, Kontostatus- und Scope-Prüfung, und stellt ihn als `res.locals.access` bereit.

### demo.js

Wendet bei aktivem Demo-Modus die Sperren für Benutzeränderungen, kritische Einstellungen, Integrationen und interne Weiterleitungsziele an. Einzelne Demo-Hostaktionen bleiben gemäß den Prüfregeln zulässig.

### Reihenfolge in app.js

Das globale IP-Limit läuft nach Helmet und vor Authentifizierung, Datenbankabfragen, CSRF-Erzeugung und Body-Parsing. Die CSRF-Middleware liest den Setup-Status nur für `POST /users` beziehungsweise `POST /api/users`, weil ausschließlich dort eine Ausnahme für die Ersteinrichtung möglich ist. Der Health-Endpunkt liest den Status weiterhin selbst. Der Konfigurations-Fingerprint wird bei der Hostregeneration vollständig geschrieben, bevor der Start als abgeschlossen gilt.

### user-id-from-me.js

Ersetzt `:me` in URL-Parametern durch die ID des aktuell authentifizierten Benutzers.

## Verwandte Seiten

- [Backend-Hilfsbibliotheken](./backend-lib.md)
- [Benutzer & Auth](../module/benutzer-auth.md)
