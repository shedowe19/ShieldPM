# ADR: Entfernung des Domain Hover Previews

## Titel

Entfernung des Website-Preview-Features (Domain Hover) aus dem Frontend.

## Status

`Akzeptiert` (Implementiert am 03.12.2025 in Commit 7756236c)

## Kontext

Im späten November/frühen Dezember 2025 wurde intensiv an einem Feature gearbeitet, das beim Überfahren einer Domain mit der Maus (`Hover`) eine Live-Vorschau der Website im Frontend einblendet (PRs #23 bis #41). Dieses Feature beinhaltete diverse Optimierungen, wie `click-to-load`, Caching-Busts, Mixed-Content-Fixes und Positionierungsanpassungen.

Letztendlich führte die Einbindung fremder Inhalte in iFrames oder durch externe Preview-Dienste jedoch zu massiven Problemen bezüglich Performance, Mixed-Content-Blockaden (HTTPS vs HTTP) und potenziellen Sicherheitsrisiken (XSS / Clickjacking-Gefahren durch das Laden nicht vertrauenswürdiger Ziel-Domains).

## Entscheidung

Das Feature "Domain Preview" wurde vollständig aus dem ShieldPM-Frontend entfernt (PR #43). Die zugehörigen React-Komponenten (wie `DomainsFormatter` Modifikationen für Previews) wurden bereinigt.

## Begründung

- **Sicherheit:** Das Einbetten beliebiger Ziel-Domains (die ein Nutzer im Proxy-Host eintragen kann) birgt das Risiko von bösartigem Code oder Content Security Policy (CSP) Verstößen innerhalb der ShieldPM Admin-Oberfläche.
- **Stabilität:** Mixed-Content-Fehler bei HTTP-Zielen konnten nicht vollumfänglich und verlässlich über Workarounds (Protocol-relative URLs) gelöst werden.
- **Wartung:** Der Code-Overhead für die Positionierung und das Caching der Previews stand in keinem Verhältnis zum tatsächlichen Mehrwert für den Administrator.

## Alternativen

- Beibehaltung mit `click-to-load` (wurde temporär in PR #33 versucht, löste aber die grundsätzlichen Sicherheitsprobleme nicht).
- Nutzung eines serverseitigen Headless-Browsers zur Screenshot-Generierung (verworfen, da ShieldPM leichtgewichtig bleiben soll und keine schweren Abhängigkeiten wie Puppeteer integrieren kann).

## Konsequenzen

### Positiv

- Saubereres und performanteres Frontend (weniger DOM-Knoten, keine externen Requests).
- Reduziertes Sicherheitsrisiko.
- Weniger Code-Wartung.

### Negativ

- Administratoren müssen die Domains manuell im neuen Tab öffnen, um den Zustand der Website visuell zu überprüfen.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
