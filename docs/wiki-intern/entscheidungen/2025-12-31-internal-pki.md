# ADR: Einführung einer internen Public Key Infrastructure (PKI)

## Titel

Implementierung einer internen Certificate Authority (CA) zur Generierung und Verwaltung von Client-Zertifikaten.

## Status

`Akzeptiert` (Implementiert am 31.12.2025 in PR #192)

## Kontext

Mit der Einführung von mTLS-Support (PR #186) konnten Administratoren externe Zertifikate hochladen, um Zero-Trust-Authentifizierung zu erzwingen. Dies stellte jedoch eine hohe Hürde dar, da Nutzer ihre eigenen CAs (z.B. über OpenSSL oder Easy-RSA) extern verwalten mussten. Es fehlte eine Lösung "aus einem Guss".

## Entscheidung

ShieldPM wurde um eine vollständige, interne Public Key Infrastructure (PKI) erweitert.

- Das Modul `backend/internal/pki.js` generiert bei der Initialisierung eine Root-CA (ECDSA).
- Administratoren können über das Dashboard direkt Client-Zertifikate (P12/PEM) generieren und für ihre Endnutzer herunterladen.
- Die Integration unterstützt Post-Quantum-Kryptografie (für zukunftssichere Zertifikate) und bindet sich nativ an die mTLS Access Lists an.

## Begründung

- **Benutzerfreundlichkeit:** Administratoren benötigen kein externes Kommandozeilen-Wissen mehr, um mTLS für ihr Heimnetzwerk oder ihr Unternehmen auszurollen.
- **Sicherheit:** Schlüsselmaterial verlässt niemals den ShieldPM-Server (außer als Download für den Client), was die Angriffsfläche minimiert.

## Konsequenzen

### Positiv

- ShieldPM wird zu einer All-in-One-Lösung für Zero-Trust und VPN-ähnliche Absicherung (zusammen mit mTLS).

### Negativ

- Höhere Verantwortung für das Backend-Team: Kryptografische Schwachstellen im CA-Generierungs-Code haben katastrophale Auswirkungen auf alle mTLS-gesicherten Endpunkte.
- Das Backup der Datenbank ist nun noch kritischer, da es Root-CA-Schlüsselmaterial enthält.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
- [Modul: PKI](../module/pki.md)
