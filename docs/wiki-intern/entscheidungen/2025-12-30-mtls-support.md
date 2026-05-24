# ADR: Einführung von Mutual TLS (mTLS) Support

## Titel

Erweiterung der Access Lists zur Unterstützung von clientseitiger Zertifikatsauthentifizierung (mTLS).

## Status

`Akzeptiert` (Implementiert am 30.12.2025 in PR #186)

## Kontext

Für hochgradig abgesicherte Dienste reicht Basic-Auth oder IP-Whitelisting oft nicht aus. Administratoren von ShieldPM benötigten eine Methode, um Zero-Trust-Konzepte umzusetzen, bei denen der Client selbst über ein kryptografisches Zertifikat verfügen muss, um überhaupt mit dem Nginx-Proxy sprechen zu dürfen.

## Entscheidung

Mutual TLS (mTLS) wurde als natives Feature in die Access Lists integriert.

- Administratoren können eine Certificate Authority (CA) hochladen.
- Wenn eine Access List mit mTLS konfiguriert wird, generiert das Backend Nginx-Direktiven (`ssl_client_certificate`, `ssl_verify_client on`), die erzwingen, dass sich Clients mit einem gültigen, von der CA signierten Client-Zertifikat ausweisen müssen.
- Bei ungültigem oder fehlendem Zertifikat lehnt Nginx die Verbindung auf TLS-Ebene ab, noch bevor HTTP verarbeitet wird (Fehler 400).

## Begründung

- **Maximale Sicherheit:** Schützt Backend-Dienste auf der Transportschicht. Angreifer ohne Client-Zertifikat können nicht einmal eine HTTP-Anfrage absetzen, was Vulnerability Scanner und DDoS-Angriffe auf Application Layer abblockt.
- **Nativer Nginx Support:** Die Implementierung greift auf tief verankerte, hochperformante Nginx-Features zurück.

## Konsequenzen

### Positiv

- ShieldPM positioniert sich als ernstzunehmender Enterprise-Proxy-Manager für Zero-Trust-Szenarien.

### Negativ

- Das Management von Client-Zertifikaten (PKI) obliegt weiterhin dem Administrator. Ein internes CA-Management (Ausstellung von Client-Certs) ist vorerst nicht Bestandteil des Features.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
- [Access Lists](../module/access-lists.md)
