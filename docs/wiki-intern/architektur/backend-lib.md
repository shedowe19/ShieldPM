# Backend-Hilfsbibliotheken (lib)

## Zweck

Dokumentation der Backend-Hilfsbibliotheken in `backend/lib/`.

## Kontext

Die `lib/`-Dateien stellen grundlegende Infrastruktur bereit, die von den `internal/`-Modulen und `routes/` verwendet wird.

## Wichtige Dateien

### Kern-Infrastruktur

| Datei                 | Zweck                                                                     |
| --------------------- | ------------------------------------------------------------------------- |
| `access.js`           | Berechtigungsprüfung (Rollen, CRUD-Rechte).                               |
| `config.js`           | Zentrale Datenbank- und Laufzeitkonfiguration.                            |
| `constants.js`        | Globale Konstanten.                                                       |
| `environment-hash.js` | Gemeinsamer Konfigurations-/Template-Fingerabdruck von Shell und Backend. |
| `error.js`            | Fehlerklassen (ItemNotFound, PermissionError usw.).                       |
| `helpers.js`          | Allgemeine Hilfsfunktionen.                                               |
| `utils.js`            | Utility-Funktionen und persistierter Umgebungsfingerabdruck.              |
| `types.js`            | JSDoc-Typdefinitionen.                                                    |

### Authentifizierung

| Datei                   | Zweck                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `auth-cookies.js`       | Cookie-basierte Auth-Logik.                                                                                              |
| `auth-password.js`      | Validiert lokale Passwort-Authentifizierung und die Länge vor dem Persistieren (mindestens 8, höchstens 72 UTF-8-Bytes). |
| `auth-session-token.js` | Session-Token-Handling.                                                                                                  |

### Datenbank

| Datei                 | Zweck                                         |
| --------------------- | --------------------------------------------- |
| `db-migrate.js`       | Migrations-Verwaltung (eigener Knex-Wrapper). |
| `migrate_template.js` | Vorlage für neue Migrationen.                 |

### Sicherheit

| Datei           | Zweck                             |
| --------------- | --------------------------------- |
| `encryption.js` | Verschlüsselungs-Hilfsfunktionen. |
| `certbot.js`    | Certbot-Hilfsfunktionen.          |

### Spezial

| Datei                | Zweck                                                       |
| -------------------- | ----------------------------------------------------------- |
| `gitops-files.js`    | Sichere Pfad- und Dateihilfe für GitOps-Import und -Export. |
| `host-response.js`   | Gemeinsame Bereinigung und Formung von Host-Antworten.      |
| `service-icons.js`   | Service-Icon-Erkennung (Favicon-Detection).                 |
| `terminal-access.js` | Zugriffsprüfung für Terminal-Sitzungen.                     |

Die AJV-Schema-Prüfung liegt nicht unter `lib/`, sondern in `backend/validate-schema.js`; sie wird in
[API-Schemas](../api/schemas.md) beschrieben.

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

### Konfigurations-Fingerabdruck

`environment-hash.js` enthält die von Shell-Startprüfung und Backend gemeinsam verwendete SHA-512-Berechnung. Sie erfasst Vorlageninhalte, Namen und Werte der darin verwendeten Umgebungsvariablen sowie `TV`. `utils.writeHash()` speichert das Ergebnis erst nach abgewarteter Host-Neuerzeugung im konfigurierten Datenverzeichnis. Siehe [Instanzkonfiguration](../konfiguration/config-dateien.md#persistente-instanzkonfiguration).

## Verhalten

- `access.js` wird von **allen** `internal/`-Modulen über den `access`-Parameter verwendet
- `config.js` liest Umgebungsvariablen und stellt sie als Konfigurationsobjekt bereit
- `error.js` definiert strukturierte Fehlertypen für konsistente API-Fehlermeldungen

## Abhängigkeiten

- Wird von `backend/internal/`, `backend/routes/` und `backend/app.js` importiert
- Keine Abhängigkeit auf `internal/`-Module (uni-direktional)

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Express-Middleware](./express-middleware.md)
- [Modulübersicht](../module/README.md)
- [Architektur-Module](../architektur/module.md)
