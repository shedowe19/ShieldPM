# ADR: Advanced 2FA Authentication (WebAuthn/Passkeys)

## Titel

Erweiterung der Zwei-Faktor-Authentifizierung um WebAuthn, Passkeys und Hardware-Tokens.

## Status

`Akzeptiert` (Implementiert am 19.03.2026 in PR #25)

## Kontext

Die Absicherung von administrativen Accounts beschränkte sich zuvor primär auf Passwörter und grundlegende Mechanismen. Für Enterprise-Kunden und sicherheitsbewusste Self-Hoster war die Unterstützung von physischen Security-Keys (YubiKey) und modernen passwortlosen Standards (Passkeys/WebAuthn) eine absolute Notwendigkeit.

## Entscheidung

Das Authentifizierungs-System von ShieldPM wurde tiefgreifend überarbeitet.
- Unterstützung für TOTP (Google Authenticator) wurde als Basis-2FA stabilisiert.
- **WebAuthn/Passkey-Integration:** Nutzer können nun Hardware-Tokens, TouchID, Windows Hello oder mobile Passkeys im Dashboard registrieren.
- Ein neues Challenge-Response-Verfahren für den Login-Flow wurde implementiert, inklusive Backup-Codes (Recovery) für den Fall eines Token-Verlusts.

## Begründung

- **Zero-Trust:** Passkeys sind kryptografisch gegen Phishing resistent, da sie domänengebunden sind.
- **Compliance:** Ermöglicht die Nutzung von ShieldPM in Hochsicherheitsumgebungen, die FIDO2 vorschreiben.

## Konsequenzen

### Positiv
- Stark erhöhte Account-Sicherheit.
- Bessere User Experience durch passwortlose Logins (FaceID/TouchID).

### Negativ
- Erhöhte Komplexität in der Datenbank (Verwaltung von Public-Keys, Credentials, Signature Countern).
- Schwieriges Testing von Edge-Cases (verschiedene Browser und Hardware-Authentifikatoren).

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
