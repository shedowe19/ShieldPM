# ADR: Einführung des Certificate Expiry Widgets

## Titel

Integration eines Widgets zur Überwachung von TLS-Zertifikatsabläufen im Dashboard.

## Status

`Akzeptiert` (Implementiert am 03.12.2025 in PR #44)

## Kontext

Administratoren mussten bisher die Zertifikats-Tabelle manuell prüfen, um herauszufinden, ob Let's Encrypt oder Custom-Zertifikate bald ablaufen. Ein proaktives Monitoring fehlte im zentralen Dashboard.

## Entscheidung

Ein neues "Certificate Expiration Widget" wurde in das Haupt-Dashboard integriert.

- Es liest die Zertifikatsdaten und parsest das Ablaufdatum (inklusive Bugfixes für UNIX-Timestamps und Leerzeichen, siehe PR #48).
- Zertifikate werden farblich hervorgehoben (Grün = sicher, Gelb = bald ablaufend, Rot = abgelaufen/kritisch).

## Begründung

- **Sichtbarkeit:** Erhöht die operationelle Sicherheit, da ablaufende Zertifikate sofort ins Auge fallen und Ausfälle verhindert werden können.
- **Benutzerfreundlichkeit:** Erspart Klicks in Untermenüs.

## Konsequenzen

### Positiv

- Bessere Überwachung des Systemzustands.

### Negativ

- Leicht erhöhte initiale Ladezeit des Dashboards (da Zertifikatsdaten parallel zu Proxy-Hosts geladen werden müssen).

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
