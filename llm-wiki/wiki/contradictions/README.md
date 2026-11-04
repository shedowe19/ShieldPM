# Widersprüche

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Hier stehen Aussagen aus Dokumentation und Code, die einander widersprechen. Beide
Behauptungen bleiben mit Quelle erhalten; nichts wird stillschweigend überschrieben.

## Übersicht

| Datum      | Thema                                                                      | Status             |
| ---------- | -------------------------------------------------------------------------- | ------------------ |
| 2026-11-04 | [SQLite in Produktion](./2026-11-04-sqlite-in-produktion.md)               | behoben 2026-11-04 |
| 2026-11-04 | [Nginx-Reload: Debounce vs. Sperre](./2026-11-04-nginx-reload-debounce.md) | behoben 2026-11-04 |
| 2026-11-04 | Veraltete Pfadfilter in `docker.yml`                                       | behoben 2026-11-04 |

## Veraltete Pfadfilter in `docker.yml` (behoben)

`docker.yml` nannte in seinen `paths`-Filtern `global/certbot-dns-plugins.json` und
`nginx-quic/**`; beide Pfade existieren im Repository nicht. Die Einträge waren
wirkungslos und irreführend. Sie wurden am 2026-11-04 entfernt; das Prüfwerkzeug
kontrolliert seitdem, dass jeder literale Filterpfad existiert
(`llm-wiki/tools/wiki-check.mjs`, Prüfung 12).

## Verwandte Seiten

- [Index](../index.md)
- [Offene Fragen](../questions/open-questions.md)
- [Aufgaben](../tasks.md)
