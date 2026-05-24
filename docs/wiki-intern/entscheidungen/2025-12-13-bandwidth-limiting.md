# ADR: Einführung des Bandwidth Limiting Features

## Titel

Implementierung von Bandbreitenbeschränkungen (Traffic Shaping) für Proxy-Hosts.

## Status

`Akzeptiert` (Implementiert am 13.12.2025 in PRs #63 bis #67)

## Kontext

ShieldPM bot Nginx-Limits für Request-Raten (Rate Limiting), aber keine native Möglichkeit, die Datendurchsatzrate (Bandbreite) pro Client oder pro Proxy-Host zu drosseln. Dies ist essenziell für Hosts, die große Dateien (z.B. Videos, ISOs) ausliefern, um das Netzwerk nicht zu überlasten.

## Entscheidung

Ein neues Bandwidth-Limiting-Feature wurde eingeführt:

- Erweiterung des Datenbank-Schemas (`proxy_host` Tabelle) um Bandbreiten-Felder.
- Frontend UI-Erweiterung im "Advanced"-Tab eines Proxy-Hosts zur Konfiguration der Drosselung (in KB/s oder MB/s).
- Das Nginx-Konfigurations-Template (`backend/templates/proxy_host.conf`) wurde angepasst, um die Nginx-Direktive `limit_rate` und `limit_rate_after` entsprechend der Benutzerkonfiguration zu setzen.

## Begründung

- **Netzwerk-Stabilität:** Verhindert, dass einzelne Nutzer die gesamte verfügbare Upload-Bandbreite des ShieldPM-Servers blockieren.
- **Nginx Native:** Die Umsetzung nutzt native Nginx-Funktionen (`limit_rate`), was sehr performant ist und keine externen Module benötigt.

## Konsequenzen

### Positiv

- Feingranulare Kontrolle über den Traffic.
- Schutz vor Bandbreiten-Erschöpfung (DDoS-Mitigation / Fair Use).

### Negativ

- Zusätzliche Komplexität in der Datenbank und den UI-Formularen.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
