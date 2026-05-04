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

Bindet JWT-Token an `res.locals.user` und `res.locals.csrfToken`.

### jwt-decode.js

Dekodiert JWT aus `Authorization: Bearer <token>` Header.

### demo.js

Aktiviert Demo-Modus wenn `isDemoMode()` true zurückgibt. Alle POST/PUT/DELETE requests werden blockiert.

### user-id-from-me.js

Ersetzt `:me` in URL-Parametern durch die ID des aktuell authentifizierten Benutzers.

## Verwandte Seiten

- [Backend-Hilfsbibliotheken](./backend-lib.md)
- [Benutzer & Auth](../module/benutzer-auth.md)
