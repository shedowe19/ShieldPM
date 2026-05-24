# ADR: Integration von OAuth2 Proxy (OIDC)

## Titel

Erweiterung der Access Lists um native OAuth2-Proxy Unterstützung.

## Status

`Akzeptiert` (Implementiert am 27.02.2026 in PR #9)

## Kontext

Nach der erfolgreichen Integration von Authentik (Dezember 2025) äußerten Nutzer den Bedarf, auch andere OIDC-kompatible Identity Provider (wie Google Workspace, GitHub, Azure AD, Keycloak) nativ anzubinden, ohne auf Authentik beschränkt zu sein. Das branchenübliche Tool hierfür ist `oauth2-proxy`.

## Entscheidung

`oauth2-proxy` wurde als unterstützter Forward-Auth-Mechanismus in die ShieldPM Access Lists aufgenommen.

- Über die UI können Parameter wie Provider, Client ID, Client Secret und Cookie-Secret hinterlegt werden.
- ShieldPM orchestriert Nginx so, dass unauthentifizierte Anfragen transparent an einen `oauth2-proxy`-Daemon (oder Endpunkt) weitergeleitet werden, der den Login-Flow mit dem gewählten IdP abwickelt.

## Begründung

- **Flexibilität:** Erlaubt die Anbindung an nahezu jeden modernen Identity Provider auf dem Markt.
- **Sicherheit:** OAuth2-Proxy ist eine kampferprobte Open-Source-Lösung für Zero-Trust-Architekturen.

## Konsequenzen

### Positiv

- ShieldPM wird für Firmennetzwerke (Enterprise) mit bestehenden IdPs extrem attraktiv.

### Negativ

- Steigende UI-Komplexität in den Access-List-Formularen, da OIDC viele Parameter (Scopes, Redirect URIs) erfordert.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
- [Access Lists](../module/access-lists.md)
