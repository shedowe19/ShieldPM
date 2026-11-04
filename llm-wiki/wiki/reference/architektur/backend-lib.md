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

Dateigrößen sind bewusst nicht angegeben: Sie ändern sich bei regulärer Wartung, ohne die Funktion der Bibliothek zu ändern. Die Regeln unter `access/*.json` werden je Aktion einmal geladen und kompiliert; nicht jede interne Funktion hat denselben Berechtigungsvertrag. Die Routen validieren JSON-Body-Eingaben mit `validator/api.js`, während `backend/schema/index.js` die OpenAPI-Definition kompiliert und zwischenspeichert.

## Begrenzte Schema- und Berechtigungsprüfung

`validator/index.js` kanonisiert Schemas und hält höchstens 128 kompilierte Validatoren in einem LRU-Cache. Beim Verdrängen wird auch der entsprechende AJV-Eintrag entfernt. Wiederholt erzeugte gleichwertige Route-Schemaobjekte belegen dadurch nicht dauerhaft zusätzlichen Speicher. Geänderte Schemaobjekte erhalten ihren neuen Validator; Payload-Klon und Typkonvertierung bleiben erhalten. Die Body-Schemas von `validator/api.js` stammen bereits aus der stabilen kompilierten OpenAPI-Struktur.

`access.js` kompiliert jede statische Aktionsregel nur einmal. Die aktuelle Benutzer-ID bleibt Validierungsdatum; die drei Selbstkonto-Regeln prüfen sie über AJVs `$data`-Vergleich und frieren keine Identität im Schema ein. Jeder neue `Access`-Kontext lädt weiterhin den aktuellen aktiven Benutzer, Rollen und Berechtigungen. Proxy-Aktionen enumerieren keine vollständige Liste aller Host-IDs mehr: Die vorhandenen Proxy-Regeln verwenden dieses Enumeration-Schema nicht, und die Ressourcendienste begrenzen weiterhin Besitzer und Sichtbarkeit in ihren eigentlichen Datenabfragen.

Regressionen: `backend/test/lib/validator-cache.spec.js` führt 100 echte HTTP-Abfragen mit frisch erzeugtem Route-Schema aus, prüft LRU/AJV-Verdrängung und Schemaänderungen. `access-validator-cache.spec.js` prüft 100 neue Zugriffskontexte, wiederverwendete Regeln für unterschiedliche Benutzer, Rechteentzug sowie gesperrte, gelöschte und noch nicht vollständig angemeldete Konten.

`utils.writeHash()` schreibt erst nach abgewarteter Host-Neuerzeugung. Die Startprüfung und die Backend-Berechnung teilen sich den Algorithmus aus `environment-hash.js`; Details stehen unter [Instanzkonfiguration](../konfiguration/config-dateien.md#persistente-instanzkonfiguration).

## Verwandte Seiten

- [Express-Middleware](./express-middleware.md)
- [API-Schemas](../api/schemas.md)
- [Datenbank](../daten/datenbank.md)
