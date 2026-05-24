# ADR: Security Hardening & Vulnerability Patching

## Titel

Systematische Behebung von kritischen Schwachstellen (Prototype Pollution, Token Bypass, Sensitive Data Exposure).

## Status

`Akzeptiert` (Implementiert zwischen 14.12.2025 und 16.12.2025 in PRs #76, #77, #92-97, #100-102)

## Kontext

Durch automatisierte Code-Analysen (wie GitHub CodeQL / Dependabot) sowie interne Audits wurden mehrere kritische bis hochgradige Sicherheitslücken in ShieldPM identifiziert:

- **Prototype Pollution im Certificate Parsing:** Ein böswilliges Zertifikat oder eine präparierte API-Payload konnte die Prototypen-Hierarchie in Node.js vergiften, was potenziell zu RCE (Remote Code Execution) führen kann.
- **Token Security Bypass:** Fehler in der Validierung von Authentifizierungs-Token erlaubten potenziell unautorisierten Zugriff auf API-Endpunkte.
- **Sensitive Data Exposure:** CodeQL schlug Alarm wegen sensibler Query-Parameter, die in Logs oder Fehlermeldungen geleakt werden konnten, sowie wegen unsicherer OIDC/Temp-Path-Handhabung.

## Entscheidung

Alle betroffenen Code-Pfade wurden gehärtet:

1. **Prototype Pollution:** Explizite Prüfung und Filterung von `__proto__`, `constructor` und `prototype` bei rekursiven Merge- und Parsing-Operationen (insbesondere bei Zertifikaten).
2. **Token Security:** Strengere Verifikation der JWT-Signaturen und Implementierung strikter Ablauf-Limits.
3. **Sensitive Queries:** Sensible Daten wurden aus URLs und standardmäßigen Fehlerlogs entfernt (Maskierung). OIDC-Prozesse wurden bezüglich Session-Fixation und Token-Leakage abgesichert.

## Begründung

- **Schutz der Nutzer:** ShieldPM verwaltet kritische Infrastruktur (Web-Proxys, TLS-Zertifikate, WAF). Die Kompromittierung des Dashboards bedeutet oft die Übernahme des gesamten Hosts.
- **Zero-Tolerance Policy:** Sicherheitslücken haben absolute Priorität über Feature-Entwicklung.

## Konsequenzen

### Positiv

- Signifikant erhöhte Resilienz gegen gezielte Angriffe (sowohl interne Rechteausweitung als auch externe Übernahmen).
- Erfolgreicher Abschluss der CodeQL-Audits (keine "High/Critical" Findings mehr).

### Negativ

- Verschärfte Input-Validierungen können vereinzelt zu API-Abweisungen führen, wenn Clients nicht-standardkonforme Payloads senden.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
