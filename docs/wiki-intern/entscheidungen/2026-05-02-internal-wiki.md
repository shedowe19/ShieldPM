# ADR: Einführung der internen Wiki-Wissensbasis (docs/wiki-intern)

## Titel

Aufbau einer bidirektionalen, LLM-optimierten Dokumentationsstruktur.

## Status

`Akzeptiert` (Implementiert am 02.05.2026 in Commit 8e3f4671)

## Kontext

Mit wachsender Projektkomplexität (Cloudflare, Tor, GitOps) war es für neue Entwickler und insbesondere für autonome KI-Agenten (wie GitHub Copilot oder externe LLMs) zunehmend schwer, die Systemarchitektur und geltenden Konventionen von ShieldPM zu durchblicken. Externe Wikis (wie GitHub Wiki) waren nicht direkt im Quellcode versioniert.

## Entscheidung

Ein projektinternes Wiki wurde unter `docs/wiki-intern/` etabliert.

- Das Wiki dient als das "Langzeitgedächtnis" des Projekts und als primäre Informationsquelle für AI-Agenten (siehe `agent.md`).
- Es dokumentiert alle Kernkomponenten, Architektur-Entscheidungen (ADR) und Deployment-Prozesse.
- Über eine CI/CD-Action (PR #161) wird dieses Verzeichnis bidirektional mit dem offiziellen GitHub-Wiki-Repository von ShieldPM synchronisiert.

## Begründung

- **Single Source of Truth:** Dokumentation und Code leben im selben Branch und veralten nicht unabhängig voneinander.
- **AI-Onboarding:** Agenten (wie in `GEMINI.md` spezifiziert) haben sofortigen, dateibasierten Zugriff auf alle Projektregeln und die Historie.

## Konsequenzen

### Positiv

- Signifikant besseres AI-Pair-Programming und reibungslosere Einarbeitung.

### Negativ

- Strikte Disziplin erforderlich: Agenten und Entwickler müssen das Wiki bei jeder Feature-Änderung aktiv pflegen (Pflichtprüfung).

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
