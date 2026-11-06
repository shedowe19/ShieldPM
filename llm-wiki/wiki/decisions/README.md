# Entscheidungen (ADR-Index)

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Sammelstelle für Architektur- und Projektentscheidungen. Jede größere Entscheidung
bekommt eine eigene Datei `YYYY-MM-DD-kurzer-titel.md`; kleinere Entscheidungen
stehen auf der jeweiligen Bereichsseite und werden hier verlinkt.

## Entscheidungen

| Datum      | Entscheidung                                                                        | Status   |
| ---------- | ----------------------------------------------------------------------------------- | -------- |
| 2026-11-04 | [Wiki-Struktur: ein Wiki-Root mit Tiefendoku](./2026-11-04-wiki-struktur.md)        | accepted |
| 2026-10-27 | [Entfernung der Wasm/WASI-Ausführung](./2026-10-27-entfernung-der-wasm-laufzeit.md) | accepted |

- [Traffic-Flow-Messgrenzen](./2026-11-05-traffic-flow-messgrenzen.md), 2026-11-05: Vorschau mit unbekannten Raten.

- [Datenbank-Bootstrap und Providerwechsel](./2026-11-06-datenbank-bootstrap-und-providerwechsel.md), 2026-11-06: accepted im Feature-Branch.

## Wie eine Entscheidung entsteht

Eine Entscheidung wird nur dokumentiert, wenn es echte Belege gibt: einen
Migrationspfad, einen Commit, einen Abschnitt in `GEMINI.md` oder eine
ausdrückliche Nutzeranweisung. Vermutungen gehören unter „Offene Fragen“.

## Vorlage

[ADR-Vorlage](./adr-template.md)

## Verwandte Seiten

- [Index](../index.md)
- [Überblick](../overview.md)
- [Architektur](../architecture/overview.md)
- [Entscheidungen (Tiefe)](../reference/architektur/entscheidungen.md)
