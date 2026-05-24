# ADR: GitOps Sync Engine

## Titel

Implementierung einer GitOps-Synchronisations-Engine auf Basis von `isomorphic-git`.

## Status

`Akzeptiert` (Implementiert am 19.01.2026 in PR #246)

## Kontext

Die Konfiguration von Reverse Proxys, Zertifikaten und Access Lists wird typischerweise über das Web-Dashboard vorgenommen. In modernen DevOps-Umgebungen besteht jedoch der Wunsch, Konfigurationen versioniert als Code (Infrastructure as Code) in einem Git-Repository (z.B. GitHub/GitLab) zu verwalten. Eine reine Backup-Funktion reichte nicht aus, um einen bidirektionalen Workflow zu ermöglichen.

## Entscheidung

Eine GitOps-Engine wurde in das Backend integriert.

- Die Library `isomorphic-git` wird verwendet, da sie native Git-Operationen in Node.js ohne Abhängigkeit zum Host-`git`-Binary ermöglicht.
- ShieldPM exportiert seine Datenbank-Entitäten (Proxy Hosts, Redirections) in strukturierte JSON/YAML-Dateien im Git-Repository.
- Änderungen im Git-Repository (z.B. durch Pull Requests) können in ShieldPM synchronisiert (gepullt) und automatisch als Nginx-Konfiguration angewendet werden.

## Begründung

- **Versionierung & Audit:** Alle Änderungen sind in Git nachvollziehbar, rückgängig zu machen und können durch Teammitglieder vor dem Deployment gereviewt werden.
- **Portabilität:** Einfacher Umzug von ShieldPM-Instanzen oder Disaster Recovery, da die gesamte Konfiguration im Git liegt.

## Konsequenzen

### Positiv

- Moderne "Infrastructure as Code"-Workflows sind nativ möglich.
- Ersetzt manuelles Datenbank-Backup.

### Negativ

- Bei gleichzeitigen Änderungen in der UI und im Git können Konflikte (Merge Conflicts) entstehen, die aktuell noch rudimentär vom Backend gehandhabt werden.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
