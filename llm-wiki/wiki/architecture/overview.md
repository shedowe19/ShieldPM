# Architektur: Überblick

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Diese Seite zeigt die Schichten, Verzeichnisse und Grenzen von ShieldPM, damit
Änderungen an der richtigen Stelle landen. Für die Tiefe pro Modul verweist sie
auf `llm-wiki/wiki/reference/`.

## Was existiert

```
Browser (React-SPA)
   │ HTTPS :81 (UI), :80/:443 (proxyte Hosts)
   ▼
Nginx (eigener Build aus shieldpm-nginx)  ── Access-Logs ──▶ GoAccess (:91)
   │ proxy_pass auf Unix-Socket /run/shieldpm/shieldpm.sock, entfernt /api
   ▼
Express-App (backend/app.js)
   │ Middleware: Helmet → Rate-Limit → Cookie → JWT → CSRF → Body → Demo
   ▼
Routes (backend/routes/**)  ──▶  Internal Services (backend/internal/**)
                                      │
                    ┌─────────────────┼──────────────────┐
                    ▼                 ▼                  ▼
             Objection-Modelle   Dateisystem          externe Dienste
             (backend/models)    /data/**             Docker, Tor, Cloudflare,
                    │            (nginx-Configs,       Telegram, ACME, DDNS
                    ▼             TLS, DB, Keys)
             SQLite/MySQL/PostgreSQL
```

Quellen: `backend/app.js:144-324` (Middleware), `backend/app.js:167` (`/api`-Präfix),
`backend/index.js:79` (Unix-Socket), `backend/internal/nginx.js:283-285`
(Konfigurationspfade). Die Nginx-Seite des `proxy_pass` liegt im Repository
`shieldpm-nginx`.

## Schichten

| Schicht             | Pfad                                                  | Verantwortung                                                                         |
| ------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| API                 | `backend/routes/` (34 Dateien)                        | HTTP-Endpunkte, Schema-Validierung, teils Berechtigungsprüfung; delegiert an Internal |
| Fachlogik           | `backend/internal/` (53 Dateien)                      | Host-Lebenszyklus, Nginx-Rendering, Integrationen, Timer                              |
| Datenzugriff        | `backend/models/` (33 Dateien: 31 Modelle + 2 Helfer) | Objection-Tabellen, Relationen, Hooks, Boolean-Konvertierung                          |
| Konfigurationstexte | `backend/templates/` (18 `.conf` + 1 HTML)            | LiquidJS-Vorlagen für Nginx-vhosts                                                    |
| Schema              | `backend/schema/`                                     | AJV/JSON Schema für Request-Validierung und OpenAPI                                   |
| Hilfen              | `backend/lib/` (51 Top-Level, 58 mit Unterordnern)    | Fehlerfabrik, Verschlüsselung, Access/Permissions, Datei-Helfer                       |
| UI                  | `frontend/src/`                                       | Seiten, Modals, Komponenten, API-Hooks, i18n, Theme                                   |
| Laufzeit-Overlay    | `rootfs/`                                             | Startskripte, systemd-Units, statische Fehlerseiten                                   |

## Wie es zusammenspielt

1. Nginx nimmt den Request an und reicht ihn über den Unix-Socket an Express
   weiter. Der `/api`-Präfix wird dabei entfernt; die Routen erwarten den Pfad ohne
   `/api`, während CSRF- und Body-Middleware zusätzlich die ungekürzte Variante
   tolerieren.
2. `backend/app.js` prüft Sicherheits-header, Rate-Limit, JWT und CSRF, bevor
   eine Route greift.
3. Die Route validiert die Eingabe und ruft einen Dienst aus `backend/internal/`.
4. Der Dienst prüft Berechtigungen über das `access`-Objekt, schreibt über
   Objection in die Datenbank und stößt bei Host-Änderungen das Nginx-Rendering an.
5. `internal/nginx.js` rendert die Liquid-Templates, schreibt
   `/data/nginx/<host_type>/<id>.conf`, prüft mit `nginx -tq` und lädt neu.
   Schlägt die Prüfung fehl, wird die vorherige Datei wiederhergestellt.

Details: [Request-Lebenszyklus](./request-lifecycle.md),
[Nginx-Engine](./nginx-engine.md), [Host-Lebenszyklus](./host-lifecycle.md),
[Hintergrundjobs](./background-jobs.md).

## Grenzen

- **Repository-Grenze:** Nginx-Kompilierung, Module und Root-`nginx.conf` gehören
  zu `shieldpm-nginx` (`GEMINI.md:99-108`).
- **Daten-Grenze:** Jeder persistente Zustand muss unter `/data/` liegen; das ist
  der Volume-Vertrag im Container (`GEMINI.md:280`).
- **Frontend-Grenze:** Komponenten rufen die API nur über React-Query-Hooks auf,
  nie per `fetch` (`.cursorrules:184`).
- **Fehlergrenze:** Route- und Internal-Code werfen nur Fehler aus
  `backend/lib/error.js`; die Express-Fehlermiddleware formatiert sie
  (`backend/app.js:328-360`). Hilfsbibliotheken können rohe `Error` werfen.

## Risiken und Stolperfallen

- Nginx-Schreibvorgänge sind serialisiert. Wer außerhalb des Lock schreibt,
  erzeugt Wettläufe zwischen Datei und Reload.
- Bulk-Operationen schreiben mit `skip_reload`; der Aufrufer entscheidet über den
  abschließenden validierten Reload. Zwischenreloads erzeugen unnötige Ausfälle.
- Booleans liegen in SQLite als `0`/`1`; nur die Modelle konvertieren.
- `domain_names` auf Proxy-Hosts ist abgeleitet (`host_domains`), kein Schreibfeld.

## Offene Fragen

- Keine offenen Fragen auf dieser Seite. Der Unix-Socket ist bei nativen
  Installationen `/run/shieldpm/shieldpm.sock` (`scripts/install.sh:1102`,
  `rootfs/usr/local/bin/start.sh:384`).

## Verwandte Seiten

- [Index](../index.md)
- [Backend](../backend/overview.md)
- [Frontend](../frontend/overview.md)
- [Datenmodell](../data/overview.md)
- [Interne Architektur (Tiefe)](../reference/architektur/ueberblick.md)
- [Interne Modulschichten](../reference/architektur/module.md)
