# SQLite in Produktion

Status: superseded
Last verified: 2026-11-04
Confidence: high

## Zweck

Diese Seite hält einen offenen Widerspruch fest: `AGENTS.md` schließt SQLite für
die Produktion aus, der Code und die Auslieferung nutzen es als Standard. Beide
Behauptungen bleiben mit Quelle erhalten.

## Behauptung A — SQLite nur in Entwicklung

- **`AGENTS.md`** (Abschnitt „Known Limitations“): „SQLite in dev only: Production
  requires MySQL or PostgreSQL.“
- **`.cursorrules:18-19`** („Database (Dev): SQLite“, „Database (Prod): MySQL or
  PostgreSQL“) wiederholt die Aussage.

## Behauptung B — SQLite ist der Standard und wird unterstützt

- `backend/lib/config.js` fällt ohne MySQL-/PostgreSQL-Variablen auf SQLite zurück
  (`backend/lib/config.js:98-112`).
- `compose.yaml:57` ist die Überschrift „Database (SQLite by default)“ der
  Konfigurationssektion; die Beispieldatei führt keine andere Datenbank als
  Standard ein.
- `GEMINI.md:172-174`: "Use current code and tests to resolve stale policy prose:
  SQLite is supported …“.
- `README.md:82` nennt SQLite als erste von drei Optionen.
- `backend/package.json:24` führt `better-sqlite3` als reguläre Abhängigkeit.

## Bewertung

Behauptung B entspricht dem Code und der ausgelieferten Standardkonfiguration.
Behauptung A ist veraltet. Sie steht weiterhin in `AGENTS.md` und kann Agenten zu
falschen Annahmen führen (z. B. „SQLite-Fälle ignorieren“).

## Offen

- Behoben am 2026-11-04: `AGENTS.md` und `.cursorrules` nennen SQLite jetzt als
  unterstützte Produktionsoption. Aufgabe **T-001** erledigt.
- Betriebsgrenze bleibt: Für mehrere Instanzen sind MySQL/MariaDB oder PostgreSQL
  empfehlenswert; dazu gibt es keinen gemessenen Beleg im Repository.

## Verwandte Seiten

- [Widersprüche](./README.md)
- [Datenbank und Migrationen](../data/migrations.md)
- [Konfiguration](../infrastructure/configuration.md)
