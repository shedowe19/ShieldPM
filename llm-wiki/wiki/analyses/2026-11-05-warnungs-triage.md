# Warnungs-Triage 2026-11-05

Status: active
Last verified: 2026-11-05
Confidence: high

## Zweck

Triage der 350 Warnungen und 22 Fehler aus dem [Datei-Audit](./2026-11-05-datei-audit.md).
Die Warnungen sind nach Schwere und Bereich sortiert; die sicherheitsrelevanten
und klar fehlerhaften Punkte wurden sofort behoben, der Rest ist in Aufgaben
überführt.

## Verteilung

| Bereich            | Anzahl | Schwerpunkt                                                      |
| ------------------ | -----: | ---------------------------------------------------------------- |
| Code               |    132 | Fehlerbehandlung, Logging, Nebenläufigkeit, veraltete Kommentare |
| Schema/OpenAPI     |     87 | Response-Verträge, Scope-Angaben, Beispiele, fehlende Parameter  |
| Dokumentation      |     55 | veraltete Pfade, Zahlen und Aussagen                             |
| Sicherheit         |     37 | CSP, SSRF, Cookies, Secrets, Rechte, Supply Chain                |
| Lokalisierung      |     24 | englische Reststrings in `bg`, `es`, `it`, `de`                  |
| Migrationen        |     12 | Rollback, MySQL-Kompatibilität, Spaltengrößen                    |
| CI/Release         |      7 | Version-Stamping, Hadolint-Pin, Digests, Shell-EOL               |
| Tests/Portabilität |      1 | Windows-Pfade in `.tscanner`                                     |

Die Bereiche überschneiden sich; die Summe entspricht den 355 ausgewerteten
Einträgen (350 Warnungen plus Fehler-Mehrfachnennungen).

## Sofort behoben

- `wiki-check.mjs`: Endlos-Loop bei `<img>`.
- `ai/executor.js`: verschachtelte Berechtigungen werden flach übernommen.
- `models/token.js`: `slice(-8)` statt wirkungslosem `substring(-8)`.
- `ai/providers.js`: fehlerhafte Tool-Argumente werden abgefangen.
- `lib/auth-cookies.js`: Duo-Cookie nutzt `isSecure(req)`.
- `lib/express/demo.js`: `unspecified`-Range blockiert (`0.0.0.0`, `::`).
- `internal/access-list.js`: normalisierte IPv4-Mapped-Adresse wird zugewiesen.
- `internal/analytics.js`: ein Zeilenfehler bricht den Batch nicht mehr ab.
- `routes/2fa.js`: TOTP-Label nutzt die E-Mail des Zielbenutzers.
- `routes/tokens.js`: fehlgeschlagene Login-Attempt-Initialisierung wird zurückgesetzt.
- `routes/nginx/certificates.js`: `/root-ca` ist authentifiziert.
- `routes/gitops.js`: fehlender Body führt nicht mehr zu einem TypeError.
- `internal/ai/prompt.js`: `get_dns_plugins` statt nicht existierendem Tool.
- Analytics-, Tor-Onion- und Upload-Relay-Schemas an die Handler angeglichen.
- Zehn veraltete Doku-/Wiki-Stellen korrigiert.

## Offene Gruppen

### T-020 Sicherheits-Härtung

CSP ohne Inline-Skripte (Nonce/Hash), CDN-Skripte im Terminal mit SRI,
Docker-Socket im Demo-Compose, Standard-Adminpasswort in `index-dev.js`,
Chat-Token in API-Antworten, Cloudflared-Decrypt-Fehler, Login-Drosselung
gegen Account-Denial-of-Service. Abnahme: jeder Punkt behoben oder mit
Begründung geschlossen; Sicherheitstests grün.

### T-021 CI und Release

Version-Stamping ersetzt nur `"0.0.0"`, Hadolint wird ungepinnt geladen,
Nginx-Basisimage ist nicht digest-gepinnt, manuelle Branch-Tags sind nicht
bereinigt, `caddy-fmt` pusht ohne Rebase, Shell-Skripte haben kein
`eol=lf`. Abnahme: reproduzierbare Builds, gepinnte Tools, grüne Workflows.

### T-022 Schema-Verträge

87 Warnungen: `expand`-Listen, fehlende Response-Schemas, falsche Scopes,
`nullable` in OpenAPI 3.1, unaufgelöste `{Hostid}`-Platzhalter, fehlende
Fehlercodes, Beispielwerte gegen eigene Typen. Abnahme: Vertragstests grün,
verbleibende Abweichungen dokumentiert.

### T-023 Migrationen

Rollback lässt Spalten zurück, MySQL-JSON-Defaults, zu kleine
Terminal-Key-Spalte, Platzhalterdomain `terminal-<id>.local`, überlappende
Indizes, `async`-Tabellen-Callbacks ohne Await. Abnahme: jede Migration
vorwärts und rückwärts auf SQLite, MariaDB und PostgreSQL geprüft.

### T-024 Dokumentation

55 verbleibende Doku-Warnungen außerhalb der bereits korrigierten Stellen:
veraltete Pfade, Zahlen, Versionsangaben und Aussagen. Abnahme: jede
Fundstelle geprüft, korrigiert oder als historisch markiert.

### T-025 Lokalisierung

`bg`, `es`, `it` enthalten je etwa 70 englische UI-Strings; `de` hat drei
englische 404-Texte. Abnahme: Locale-Check und Sichtprüfung ohne offene
Reststrings.

### T-026 Portabilität

`.tscanner`-Tests scheitern unter Windows an POSIX-Pfaden, Rechten und
Symlinks; der Backend-`tsc`-Lauf umfasst `routes/` und `migrations/` nicht.
Abnahme: Tests plattformneutral, Typecheck deckt die Ordner ab.

### T-027 Konfigurations-Hygiene

Biome-Schema und `recommended` veraltet, `.yarnrc.yml` wirkungslos unter
Yarn 1, `THIRD-PARTY-NOTICES`-Header verspricht mehr, als die Liste hält,
CodeQL-Ausschluss ohne Begründung. Abnahme: Konfigurationen konsistent und
begründet.

## Verwandte Seiten

- [Datei-Audit 2026-11-05](./2026-11-05-datei-audit.md)
- [Aufgaben](../tasks.md)
- [Abdeckung](../coverage.md)
- [Index](../index.md)
