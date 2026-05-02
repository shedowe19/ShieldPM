# Glossar

## Zweck

Begriffsklärung für häufig verwendete Fachbegriffe im Projekt.

## Begriffe

| Begriff | Beschreibung |
|---|---|
| **Proxy-Host** | Ein Reverse-Proxy-Eintrag, der eingehende Anfragen an einen Upstream-Server weiterleitet |
| **Dead-Host** | Ein Host, der absichtlich 404 zurückgibt (Domain-Blockierung) |
| **Stream** | TCP/UDP-Weiterleitung (Layer 4) |
| **Access-List** | Zugriffskontrolle via Basic Auth, IP-Ranges oder mTLS |
| **WAF** | Web Application Firewall — ModSecurity oder OpenAppSec |
| **IPS** | Intrusion Prevention System — CrowdSec |
| **CRS** | Core Rule Set — OWASP ModSecurity Regelwerk |
| **ACME** | Automatic Certificate Management Environment (Let's Encrypt Protokoll) |
| **mTLS** | Mutual TLS — Client-Zertifikat-Authentifizierung |
| **QUIC** | UDP-basiertes Transportprotokoll (HTTP/3) |
| **Anubis** | PoW-Gate (Proof of Work) gegen automatisierte Bots |
| **OAuth2-Proxy** | Reverse-Auth-Proxy für SSO (Google, GitHub, Azure, OIDC) |
| **GitOps** | Konfigurationsverwaltung über Git-Repositories |
| **ChatOps** | Verwaltung über Chat-Plattformen (Telegram) |
| **DDNS** | Dynamic DNS — automatische DNS-Aktualisierung bei IP-Wechsel |
| **Turbo-Loader** | Parallele Downloads für große Dateien |
| **GoAccess** | Echtzeit-Web-Analytics-Tool |
| **Debounced Reload** | Verzögerter Nginx-Reload (2s) zur Bündelung mehrerer Änderungen |
| **EJS** | Embedded JavaScript Templates (für Nginx-Konfigurationen) |
| **Objection.js** | ORM (Object-Relational Mapping) für Node.js |
| **Knex.js** | SQL-Query-Builder und Migrationstool |
| **rootfs** | Docker-Overlay-Dateien, die ins Container-Dateisystem kopiert werden |

## Verwandte Seiten

- [Projekt-Überblick](./projekt/ueberblick.md)
- [Architektur-Überblick](./architektur/ueberblick.md)
