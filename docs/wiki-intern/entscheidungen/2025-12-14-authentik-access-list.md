# ADR: Authentik (OIDC/Proxy) Access List Integration

## Titel

Erweiterung der Access Lists um native Authentik-Forward-Auth-Unterstützung.

## Status

`Akzeptiert` (Implementiert am 14.12.2025 in PRs #78 bis #91)

## Kontext

Bisher konnten Proxy-Hosts nur mit Basic-Auth oder mTLS über ShieldPM-Access-Lists geschützt werden. In modernen Infrastrukturen wird jedoch oft ein Identity Provider (IdP) wie Authentik genutzt, um Single Sign-On (SSO) und Multi-Faktor-Authentifizierung (MFA) vor Webdienste zu schalten. Administratoren mussten dies bisher durch komplexe manuelle Custom Nginx Locations (Forward Auth) lösen.

## Entscheidung

Ein neuer Access-List-Typ für **Authentik** wurde nativ in ShieldPM integriert.

- In der UI kann beim Erstellen einer Access List nun "Authentik" ausgewählt werden.
- Das Backend generiert automatisch die notwendigen Nginx-Direktiven (`auth_request`, Fehler-Umleitungen zu Authentik-Outposts), um den Traffic durch den Authentik-Proxy zu verifizieren, bevor er an den eigentlichen Upstream-Server weitergeleitet wird.

## Begründung

- **Usability:** Reduziert die Fehleranfälligkeit bei der manuellen Konfiguration von Forward-Auth drastisch.
- **Enterprise-Fokus:** Macht ShieldPM attraktiver für Zero-Trust-Architekturen, bei denen Dienste nicht öffentlich exponiert werden dürfen, ohne vorherige IdP-Prüfung.

## Alternativen

- Exklusive Unterstützung für Authelia oder Keycloak (verworfen zugunsten von Authentik, da die Architektur erweiterbar gehalten wurde und Authentik sehr gut dokumentierte Nginx-Forward-Auth-Schnipsel bereitstellt).

## Konsequenzen

### Positiv

- Nahtloses Single-Sign-On-Erlebnis für Nutzer der Proxy-Hosts.
- Zentrale Authentifizierungssteuerung.

### Negativ

- Erhöhte Komplexität in der `backend/templates/proxy_host.conf` und `access_list.conf`, da nun dynamisch zwischen BasicAuth, mTLS und Authentik unterschieden werden muss.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
- [Access Lists](../module/access-lists.md)
