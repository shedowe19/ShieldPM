# ADR: Einführung Hidden API Key für Sentinel / Integrationen

## Titel

Implementierung von verborgenen API-Keys ("Hidden API Key") zur sicheren System-zu-System-Kommunikation.

## Status

`Akzeptiert` (Implementiert am 13.12.2025 in PRs #68 bis #70)

## Kontext

ShieldPM benötigt Schnittstellen für Automatisierungsscripte, Sentinel-Überwachung und Drittanbieter-Integrationen. Standard-JWT-Tokens laufen ab und eignen sich nicht gut für langlebige System-Daemons. Reguläre API-Keys bargen das Risiko, bei UI-Sitzungen kompromittiert zu werden, wenn sie vollständig im Klartext auslesbar im Frontend standen.

## Entscheidung

Ein Feature für "Hidden API Keys" wurde eingeführt:

- API-Keys können für Nutzer/System-Accounts generiert werden.
- Der Key wird **nur einmalig** nach der Generierung im Klartext im Frontend angezeigt.
- In der Datenbank wird ein sicherer Hash (z.B. mittels bcrypt/Argon2) oder eine stark verschlüsselte Version gespeichert, analog zu Passwörtern.

## Begründung

- **Sicherheit:** Verhindert den Diebstahl von API-Keys durch kompromittierte Admin-Sitzungen (Session Hijacking / XSS). Ein Angreifer, der Lesezugriff auf das Dashboard erlangt, kann bestehende API-Keys nicht extrahieren.
- **Best Practice:** Folgt den Industrie-Standards (wie bei AWS, GitHub, Stripe), API-Secrets nur bei Erstellung anzuzeigen.

## Konsequenzen

### Positiv

- Stark erhöhte Sicherheit für Automatisierungs-Schnittstellen.

### Negativ

- Bei Verlust des API-Keys muss dieser unwiderruflich gelöscht und neu generiert werden, was verbundene Dienste kurzzeitig unterbrechen kann.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
- [Benutzer-Auth](../module/benutzer-auth.md)
