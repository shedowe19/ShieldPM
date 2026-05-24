# ADR: Einführung von MySQL als Produktionsdatenbank

## Titel

Erweiterung des ORMs (Knex/Objection.js) zur Unterstützung von MySQL / MariaDB als alternative zur lokalen SQLite-Datenbank.

## Status

`Akzeptiert` (Implementiert am 24.12.2025 in PR #154)

## Kontext

ShieldPM nutzte primär `better-sqlite3` für die lokale Speicherung. Dies ist für kleine bis mittlere Heim-Setups ausreichend, blockiert jedoch Enterprise-Features wie High Availability (HA) / Active-Active Setups, da SQLite-Dateien schwer über Netzwerk-Storage (NFS/SMB) geteilt werden können, ohne zu korrumpieren.

## Entscheidung

Das Backend wurde refactored, um nativ MySQL/MariaDB als Datenbank-Backend zu unterstützen.

- Über Umgebungsvariablen (`DB_MYSQL_HOST`, `DB_MYSQL_PORT`, etc.) kann der DB-Treiber von SQLite auf MySQL umgeschaltet werden.
- Knex.js Migrationen wurden geprüft und angepasst, damit sie dialekt-agnostisch funktionieren (Datentypen wie Booleans werden nun konsistent gehandhabt).
- Dockerfile und Build-Prozesse integrieren nun den `mysql2` Treiber.

## Begründung

- **Skalierbarkeit:** Erlaubt den Einsatz von ShieldPM in Kubernetes-Clustern oder Multi-Node-Docker-Swarm-Setups, in denen die Datenbank entkoppelt ist.
- **Enterprise-Readiness:** Große Nutzer fordern oft zentrale Datenbank-Verwaltung für Backups und Ausfallsicherheit.

## Konsequenzen

### Positiv

- ShieldPM ist nun Cluster-fähig.

### Negativ

- Bei der Entwicklung neuer Features (insbesondere Knex-Migrationen) muss nun immer sichergestellt werden, dass SQL-Queries sowohl unter SQLite als auch unter MySQL lauffähig sind. Reine Dialekt-spezifische SQL-Funktionen sind verboten.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
- [Datenbank](../konfiguration/datenbank.md)
