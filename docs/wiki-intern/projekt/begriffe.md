# Begriffe

## Zweck

Erklärung wichtiger Fachbegriffe, die im Projekt verwendet werden. Dient als Schnelleinstieg für neue Teammitglieder und LLMs.

## Kontext

Diese Begriffe tauchen im gesamten Projekt auf — in Code, Konfiguration und Dokumentation.

## Begriffsliste

| Begriff | Beschreibung |
|---|---|
| **Proxy-Host** | Ein Reverse-Proxy-Eintrag, der eingehende Anfragen an einen Upstream-Server weiterleitet |
| **Dead-Host** | Ein Host, der absichtlich 404 zurückgibt (Domain-Blockierung) |
| **Stream** | TCP/UDP-Weiterleitung auf Layer 4 (kein HTTP) |
| **Access-List** | Zugriffskontrolle via Basic Auth, IP-Ranges oder mTLS-Client-Zertifikate |
| **WAF** | Web Application Firewall — hier ModSecurity oder OpenAppSec |
| **IPS** | Intrusion Prevention System — hier CrowdSec |
| **CRS** | Core Rule Set — OWASP ModSecurity Regelwerk (v4) |
| **ACME** | Automatic Certificate Management Environment (Let's Encrypt Protokoll) |
| **mTLS** | Mutual TLS — Client-Zertifikat-Authentifizierung |
| **QUIC** | UDP-basiertes Transportprotokoll für HTTP/3 |
| **Anubis** | PoW-Gate (Proof of Work) gegen automatisierte Bots und AI-Crawler |
| **OAuth2-Proxy** | Reverse-Auth-Proxy für SSO (Google, GitHub, Azure, OIDC) |
| **GitOps** | Konfigurationsverwaltung über Git-Repositories (isomorphic-git) |
| **ChatOps** | Verwaltung über Chat-Plattformen — hier Telegram (telegraf) |
| **DDNS** | Dynamic DNS — automatische DNS-Aktualisierung bei IP-Wechsel |
| **Turbo-Loader** | Parallele Downloads für große Dateien |
| **GoAccess** | Echtzeit-Web-Analytics-Tool (Port :91) |
| **Debounced Reload** | Verzögerter Nginx-Reload (2s) zur Bündelung mehrerer Änderungen |
| **EJS** | Embedded JavaScript Templates (für Nginx-Konfigurationen) |
| **Objection.js** | ORM (Object-Relational Mapping) für Node.js basierend auf Knex |
| **Knex.js** | SQL-Query-Builder und Migrationstool für Node.js |
| **rootfs** | Docker-Overlay-Dateien, die ins Container-Dateisystem kopiert werden |
| **NPM** | Nginx Proxy Manager — das Ursprungsprojekt, nicht zu verwechseln mit npm (Node Package Manager) |
| **NPMplus** | ZoeyVids Fork von NPM, Basis für ShieldPM |
| **Internal** | Backend-Business-Logik-Schicht (`backend/internal/`) |
| **ML-KEM** | Machine Learning Key Encapsulation Mechanism — Post-Quantum-Kryptographie |

## Offene Fragen

- Keine

## Verwandte Seiten

- [Projekt-Überblick](./ueberblick.md)
- [Glossar (Root-Ebene)](../glossar.md)
