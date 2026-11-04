# Backend

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Diese Seite beschreibt Aufbau und Konventionen des Express-Backends: wie ein
Dienst aussieht, wie Berechtigungen geprüft werden, wie Fehler aussehen und wo
neuer Code hingehört.

## Was existiert

```
backend/
├── index.js            Startreihenfolge, Timer, Unix-Socket
├── app.js              Express-App, Middleware, Fehlerbehandlung
├── db.js               Knex-Instanz aus der DB-Konfiguration
├── knexfile.js         Migrationskonfiguration (CLI)
├── setup.js           Setup-Wizard-Status, Initial-Admin
├── internal/           53 Dateien: 49 Fachmodule + 4 unter internal/ai/
├── routes/             34 Route-Dateien
├── models/             33 Dateien: 31 DB-Modelle + token.js, now_helper.js
├── lib/                51 Hilfsmodule
├── lib/access/         Berechtigungsschemas je Aktion
├── schema/             JSON Schema + OpenAPI
├── templates/          Liquid-Vorlagen
├── migrations/         91 Knex-Migrationen
└── test/               Vitest-Tests (Unit, Integration, Migrationen, CI-Verträge)
```

## Dienst-Muster

Fachlogik liegt als Singleton-Objekt in `backend/internal/`, nicht als Klasse:

```javascript
const internalExample = {
  async create(access, data) {
    /* ... */
  },
  async get(access, data) {
    /* ... */
  },
  async getAll(access, expand, search_query) {
    /* ... */
  },
  async delete(access, data) {
    /* ... */
  },
};
export default internalExample;
```

Regeln (`.cursorrules:143-169`; JSDoc-Regel `.cursorrules:210`):

- Erstes Argument ist immer `access`.
- Routen greifen nicht direkt auf die Datenbank zu; sie rufen Dienste auf.
- Dienste rufen andere Dienste auf, z. B. `internalNginx.configure(...)`.
- Jede Methode hat JSDoc mit `@param`/`@returns`.

## Berechtigungen

- `backend/lib/access.js` lädt das Token, liest den Benutzer und stellt
  `access.can("<bereich>:<aktion>")` bereit.
- Die Regeln stehen als JSON je Aktion in `backend/lib/access/` (z. B.
  `proxy_hosts-update.json`, `settings-get.json`). Rollen und Basisschema liegen in
  `roles.json` und `permissions.json`.
- Ein neuer Endpunkt braucht fast immer eine neue Datei in `lib/access/`; fehlt sie,
  schlägt die Prüfung fehl.
- Die Prüfung darf sowohl in der Route als auch im Dienst liegen; das ist bewusst
  gemischt (`llm-wiki/wiki/reference/architektur/module.md:13`).

## Fehler

`backend/lib/error.js` ist die einzige Fehlerquelle im Fachcode:

```javascript
import errs from "../lib/error.js";
throw new errs.ItemNotFoundError(id);
throw new errs.PermissionError("Not allowed");
```

- `public: true` gibt die Meldung an den Client weiter, sonst `Internal Error`
  (`backend/app.js:335-339`).
- `message_i18n` wird, wenn vorhanden, mit ausgeliefert.
- Interna gehören in `previous`/Logs, nicht in die Antwort.

## Datenzugriff

- Modelle extenden Objection `Model` und definieren `tableName`, meist
  `relationMappings`; `jsonAttributes` nur bei Modellen mit JSON-Spalten.
- Booleans sind in SQLite `0`/`1`; die Modelle konvertieren.
- Zeitstempel setzen `$beforeInsert`/`$beforeUpdate`.
- Roh-SQL ist die Ausnahme (Migrationen, Analytics-Aggregate, Datenbankmetriken).

## Logging und Konfiguration

- `backend/logger.js` exportiert benannte Logger (`global`, `express`, `access`,
  `migrate`, `setup`, …) auf Basis von `signale`.
- Datenbankkonfiguration: `/data/shieldpm/default.json`, sonst Umgebungsvariablen
  (`backend/lib/config.js:16-113`).
- Schlüssel: `/data/shieldpm/keys.json` (`backend/lib/config.js:7`).

## Risiken und Stolperfallen

- **ESM only:** kein `require()`, außer in `.cjs`-Dateien wie `validate-env.cjs`.
- **`access` vergessen:** Der Dienst läuft dann ohne Berechtigungsprüfung.
- **Direkter Nginx-Aufruf:** umgeht Sperre und Validierung.
- **Neue Tabelle ohne Migration:** Tests mit vollständigem Schema schlagen fehl.
- **Neue Umgebungsvariable:** muss in `backend/validate-env.cjs`, in
  `rootfs/.env.example` und in der Konfigurationsdoku auftauchen.

## Offene Fragen

- Unklar: Ob die Mischung aus Routen- und Dienst-Berechtigungsprüfung langfristig
  vereinheitlicht werden soll. `confidence: low`.

## Verwandte Seiten

- [Architektur](../architecture/overview.md)
- [Request-Lebenszyklus](../architecture/request-lifecycle.md)
- [API-Überblick](../api/overview.md)
- [Datenmodell](../data/overview.md)
- [Backend-Hilfsbibliotheken (Tiefe)](../reference/architektur/backend-lib.md)
- [Express-Middleware (Tiefe)](../reference/architektur/express-middleware.md)
