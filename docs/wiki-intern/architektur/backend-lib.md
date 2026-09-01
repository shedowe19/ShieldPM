# Backend-Hilfsbibliotheken (lib)

## Zweck

Dokumentation der Backend-Hilfsbibliotheken in `backend/lib/`.

## Kontext

Die `lib/`-Dateien stellen grundlegende Infrastruktur bereit, die von den `internal/`-Modulen und `routes/` verwendet wird.

## Wichtige Dateien

### Kern-Infrastruktur

| Datei          | Größe  | Zweck                                                   |
| -------------- | ------ | ------------------------------------------------------- |
| `access.js`    | 7.8 KB | Berechtigungsprüfung (Rollen, CRUD-Rechte)              |
| `config.js`    | 6.6 KB | Zentrale Konfigurationslogik (Umgebungsvariablen laden) |
| `error.js`     | 3.1 KB | Fehlerklassen (ItemNotFound, PermissionError, etc.)     |
| `helpers.js`   | 1.5 KB | Allgemeine Hilfsfunktionen                              |
| `utils.js`     | 3 KB   | Utility-Funktionen                                      |
| `constants.js` | 140 B  | Globale Konstanten                                      |
| `types.js`     | 533 B  | Typ-Definitionen                                        |

### Authentifizierung

| Datei                   | Größe  | Zweck                      |
| ----------------------- | ------ | -------------------------- |
| `auth-cookies.js`       | 1.5 KB | Cookie-basierte Auth-Logik |
| `auth-session-token.js` | 687 B  | Session-Token-Handling     |

### Datenbank

| Datei                 | Größe  | Zweck                                              |
| --------------------- | ------ | -------------------------------------------------- |
| `db-migrate.js`       | 4.2 KB | Migrations-Verwaltung (custom Knex-Wrapper)        |
| `migrate_template.js` | 1.2 KB | Template für neue Migrationen                      |
| `sqlite-backup.js`    | —      | Verifizierte Online-Snapshots und atomarer Restore |

### Sicherheit

| Datei                  | Größe  | Zweck                                                                |
| ---------------------- | ------ | -------------------------------------------------------------------- |
| `encryption.js`        | 1 KB   | Verschlüsselungs-Hilfsfunktionen                                     |
| `certbot.js`           | 1.3 KB | Certbot-Hilfsfunktionen                                              |
| `load-env-secrets.js`  | —      | Sicheres generisches Laden von `<NAME>_FILE` vor anderen App-Modulen |
| `graceful-shutdown.js` | —      | Globaler 15-Sekunden-Shutdown-Koordinator                            |

### Spezial

| Datei                | Größe  | Zweck                                      |
| -------------------- | ------ | ------------------------------------------ |
| `service-icons.js`   | 9.3 KB | Service-Icon-Erkennung (Favicon-Detection) |
| `validate-schema.js` | 493 B  | AJV JSON-Schema-Validierung                |

### Unterordner `express/`

| Datei                | Größe  | Zweck                                      |
| -------------------- | ------ | ------------------------------------------ |
| `demo.js`            | 5.8 KB | Demo-Modus-Middleware (read-only Zugriff)  |
| `jwt-decode.js`      | 553 B  | JWT-Token aus Request dekodieren           |
| `jwt.js`             | 352 B  | JWT-Authentifizierungs-Middleware          |
| `user-id-from-me.js` | 337 B  | Ersetzt `me` in URL durch aktuelle User-ID |

Siehe auch: [Express-Middleware](./express-middleware.md)

### Unterordner `validator/`

| Datei      | Größe  | Zweck                    |
| ---------- | ------ | ------------------------ |
| `api.js`   | 1.4 KB | API-Request-Validierung  |
| `index.js` | 922 B  | Validator-Einstiegspunkt |

### Unterordner `access/`

Enthält RBAC-Regeln pro Ressource (ca. 3.3 KB gesamt).

## Verhalten

- `access.js` wird von **allen** `internal/`-Modulen über den `access`-Parameter verwendet
- `config.js` liest Umgebungsvariablen und stellt sie als Konfigurationsobjekt bereit
- `error.js` definiert strukturierte Fehlertypen für konsistente API-Fehlermeldungen
- `graceful-shutdown.js` wartet auf den laufenden Startup-Versuch, beendet HTTP-Annahme innerhalb einer separaten
  Fünf-Sekunden-Phase, führt alle Producer-Hooks zweimal idempotent mit `Promise.allSettled()` aus und schließt den
  Knex-Pool zuletzt. Eine globale 15-Sekunden-Frist erzwingt notfalls das Prozessende.

## Abhängigkeiten

- Wird von `backend/internal/`, `backend/routes/` und `backend/app.js` importiert
- Keine Abhängigkeit auf `internal/`-Module (uni-direktional)

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Express-Middleware](./express-middleware.md)
- [Modulübersicht](../module/README.md)
- [Architektur-Module](../architektur/module.md)
