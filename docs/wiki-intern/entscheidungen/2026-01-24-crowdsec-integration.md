# ADR: CrowdSec IPS Integration (Lua Bouncer)

## Titel

Tiefenintegration des CrowdSec Intrusion Prevention Systems (IPS) direkt in Nginx.

## Status

`Akzeptiert` (Implementiert am 24.01.2026)

## Kontext

Obwohl Nginx über grundlegende Rate-Limiting- und Access-List-Funktionen verfügte, fehlte eine intelligente, netzwerkübergreifende Abwehr gegen bekannte bösartige IP-Adressen (Botnetze, Scanner). Ein modernes IPS, das Echtzeit-Bedrohungsdaten austauscht, war zwingend notwendig für die Enterprise-Sicherheit.

## Entscheidung

CrowdSec wurde als primäres Intrusion Prevention System nativ in ShieldPM integriert.
- Die Nginx-Instanz nutzt den **CrowdSec Lua Bouncer**, der über das `lua-nginx-module` direkt in den Request-Zyklus eingreift (`access_by_lua_block`).
- Nginx liest bei jedem Request die IP aus, prüft sie gegen die lokale CrowdSec-LAPI (Local API) und blockiert den Zugriff sofort (Drop oder Captcha), wenn die IP als bösartig markiert ist.
- Das Backend verwaltet die Bereitstellung der CrowdSec-Kollektionen (`collection.yaml`) und Parser, speziell abgestimmt auf das JSON-Access-Log von ShieldPM.
- Ein UI-Toggle ermöglicht die granulare Aktivierung des CrowdSec-Schutzes pro Proxy-Host.

## Begründung

- **Community-Intelligence:** CrowdSec bietet exzellenten Schutz gegen Zero-Day-Scanner und Botnetze durch die globale CTI-Datenbank.
- **Performance:** Die Lua-Bouncer-Integration in Nginx ist extrem performant (Sub-Millisekunden-Latenz) und blockiert den Traffic, bevor er das Backend erreicht.

## Konsequenzen

### Positiv
- Massiver Gewinn an Applikations- und Infrastruktursicherheit ("Shield"-Mentalität).

### Negativ
- Erheblich komplexere Nginx-Konfiguration (`init_by_lua`, Abhängigkeit zu `crowdsec_nginx.conf`).
- Hoher Setup-Aufwand im Installationsskript (`install.sh`), da die LAPI und der Agent auf dem Host-System oder in Containern korrekt provisioniert werden müssen.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
