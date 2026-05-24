# ADR: Project Fork & Rebranding (NPMplus -> ShieldPM)

## Titel

Abspaltung (Hard-Fork) und Rebranding zu "ShieldPM".

## Status

`Akzeptiert` (Implementiert am 06.01.2026)

## Kontext

Das Projekt basierte historisch auf dem Nginx Proxy Manager (NPM) bzw. einem fortgeschrittenen Fork namens NPMplus. Durch die massiven architektonischen Änderungen (AI Agent, GitOps, PKI, WAF-Integrationen, Tor, WireGuard) wuchs die Codebasis so weit über das ursprüngliche Konzept hinaus, dass eine Rückwärtskompatibilität oder ein reines Fortführen als "Plus"-Version nicht mehr sinnvoll war.

## Entscheidung

Ein vollständiger Hard-Fork wurde vollzogen, kombiniert mit einem kompletten Rebranding zu **ShieldPM** (Shedowe's Shield Proxy Manager).
- Alle Referenzen auf `NPMplus` und `Nginx Proxy Manager` in Code, UI, Lockfiles, Docker-Images und Dokumentation wurden entfernt oder durch `ShieldPM` ersetzt.
- Die Lizenz wurde auf eine "ShieldPM Proprietary License" bzw. einen Private Use Copyright Hinweis umgestellt.
- Migration der Docker-Registries zu `ghcr.io/shedowe19/shieldpm`.

## Begründung

- **Identität:** Das Projekt benötigt eine eigenständige Identität, die den Fokus auf Sicherheit (Shield) und fortschrittliches Management (PM) unterstreicht.
- **Unabhängigkeit:** Befreiung von den Altlasten und Erwartungshaltungen der ursprünglichen NPM-Community, um radikalere Architekturentscheidungen (wie den Ersatz von SQLite durch MySQL, Nginx-Quic, AI-Integration) treffen zu können.

## Konsequenzen

### Positiv
- Klare Positionierung als eigenständiges, sicherheitsfokussiertes Enterprise-Produkt.

### Negativ
- Brechen der Kompatibilität für bestehende Nutzer, die ein einfaches Drop-in-Replacement für den alten NPMplus erwarteten.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
