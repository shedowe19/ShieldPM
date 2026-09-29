# Backend-Hilfsbibliotheken (lib)

## Zweck

`backend/lib/` bündelt wiederverwendbare Funktionen für Express-Routen, interne Dienste, Datenbank, Sicherheit und Nginx-Konfiguration. Nicht jede Datei wird von jedem Dienst importiert.

## Wichtige Dateien

| Datei                                           | Zweck                                                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `access.js` und `access/*.json`                 | Laden und Prüfen der Berechtigungen für Ressourcenaktionen                                                                       |
| `config.js`                                     | Datenbankauswahl, Schlüssel und Konfiguration aus `/data/shieldpm/default.json` beziehungsweise Umgebungsvariablen               |
| `error.js`                                      | Strukturierte Fehlertypen                                                                                                        |
| `auth-cookies.js`, `auth-session-token.js`      | Authentifizierungs-Cookies und Sitzungs-Token-Hilfen                                                                             |
| `db-migrate.js`                                 | Schema-geprüfter SQLite-Import in eine neue MySQL-/PostgreSQL-Datenbank; der Knex-Migrationsrunner liegt in `backend/migrate.js` |
| `migrate_template.js`                           | Vorlage für neue Migrationen                                                                                                     |
| `encryption.js`                                 | Verschlüsselung mit persistentem Schlüssel                                                                                       |
| `certbot.js`                                    | Certbot-Aufrufe und deren Synchronisierung                                                                                       |
| `service-icons.js`                              | Service-Icon-Erkennung                                                                                                           |
| `analytics-range.js`, `analytics-response.js`   | Bereichsauswahl und Serialisierung für Host-Analytics                                                                            |
| `nginx-preview.js`, `host-response.js`          | Konfigurationsvorschau und Bereinigung von Host-Antworten                                                                        |
| `gitops-files.js`, `terminal-access.js`         | GitOps-Dateiverarbeitung und Terminal-Zugriffshelfer                                                                             |
| `helpers.js`, `constants.js`, `types.js`        | Konvertierungsfunktionen, gemeinsame Konstanten und Typreferenzen                                                                |
| `environment-hash.js`                           | SHA-512-Fingerabdruck aus Vorlagen, referenzierten Umgebungsvariablen und `TV`                                                   |
| `utils.js`                                      | Prozessaufrufe, LiquidJS-Renderengine und Schreiben des Fingerabdrucks                                                           |
| `validator/api.js`, `validator/index.js`        | API-/AJV-Validierung                                                                                                             |
| `express/jwt.js`, `express/jwt-decode.js`       | Bearer- oder Cookie-JWT übernehmen und aktuelle Berechtigungen laden                                                             |
| `express/demo.js`, `express/user-id-from-me.js` | Demo-Beschränkungen und `me`-Pfadauflösung                                                                                       |

Dateigrößen sind bewusst nicht angegeben: Sie ändern sich bei regulärer Wartung, ohne die Funktion der Bibliothek zu ändern. Die Regeln unter `access/*.json` werden pro Aktion geladen; nicht jede interne Funktion hat denselben Berechtigungsvertrag. Die Routen validieren JSON-Body-Eingaben mit `validator/api.js`, während `backend/schema/index.js` die OpenAPI-Definition kompiliert und zwischenspeichert.

`utils.writeHash()` schreibt erst nach abgewarteter Host-Neuerzeugung. Die Startprüfung und die Backend-Berechnung teilen sich den Algorithmus aus `environment-hash.js`; Details stehen unter [Instanzkonfiguration](../konfiguration/config-dateien.md#persistente-instanzkonfiguration).

## Verwandte Seiten

- [Express-Middleware](./express-middleware.md)
- [API-Schemas](../api/schemas.md)
- [Datenbank](../daten/datenbank.md)
