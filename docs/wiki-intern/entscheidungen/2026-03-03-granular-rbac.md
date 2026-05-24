# ADR: Granular Role-Based Access Control (RBAC)

## Titel

Einführung granularer Benutzerberechtigungen für administrative Features.

## Status

`Akzeptiert` (Implementiert am 03.03.2026)

## Kontext

Bis Version 3.12 gab es in ShieldPM nur ein binäres Berechtigungskonzept: Entweder ein Benutzer war normaler Nutzer (konnte nur eigene Hosts verwalten) oder globaler Administrator (durfte alles). Mit der wachsenden Anzahl an Architektur-Features (Tor, Cloudflare Tunnels, AI-Agent, Analytics) entstand die Notwendigkeit, Administratoren in ihrer Reichweite zu beschränken.

## Entscheidung

Ein feinmaschiges Role-Based Access Control (RBAC) System wurde integriert.
- Die Datenbanktabelle `user` wurde um granulare Berechtigungs-Flags erweitert (z.B. `allow_cloudflared`, `allow_tor`, `allow_ddns`, `allow_analytics`, `allow_chatops`).
- Das Frontend (PermissionsModal) wurde umgeschrieben, um das Zuweisen dieser Einzelrechte an Sub-Administratoren zu ermöglichen.
- Das Backend validiert bei jeder API-Anfrage nicht nur die Basis-Rolle (`access.can('users:manage')`), sondern prüft auch die expliziten Feature-Flags.

## Begründung

- **Principle of Least Privilege:** Sicherheit durch minimale Rechtevergabe. Ein Nutzer, der nur Analytics betrachten soll, darf nicht versehentlich Tor-Onion-Services aktivieren können.
- **Mandantenfähigkeit:** Ermöglicht den Einsatz von ShieldPM in größeren Organisationen oder durch Managed Service Provider (MSP), die Features pro Kunde lizenzieren oder freischalten wollen.

## Konsequenzen

### Positiv
- Stark erhöhte Systemsicherheit bei delegierter Administration.

### Negativ
- Erhöhte Code-Komplexität im API-Layer, da jede Route nun auf spezifische Flags validiert werden muss.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
