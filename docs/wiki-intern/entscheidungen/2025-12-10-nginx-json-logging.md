# ADR: Einführung von JSON Access Logging für Nginx

## Titel

Umstellung des Nginx-Access-Logs von kombiniertem Textformat (`combined`) auf ein strukturiertes JSON-Format (`json_analytics`).

## Status

`Akzeptiert` (Implementiert am 10.12.2025 in Commit 1df93a1b)

## Kontext

Der Proxy Manager generierte standardmäßig Access-Logs im klassischen Nginx-Format (oder loggte diese gar nicht). Für das Analytics-Dashboard, CrowdSec und Fail2Ban ist das Auswerten von rohen Log-Zeilen per Regex fehleranfällig und CPU-intensiv.

## Entscheidung

Das Access-Log in der Haupt-Nginx-Konfiguration (`nginx.conf`) wurde auf ein dediziertes JSON-Format umgestellt (`log_format json_analytics`).

- Nginx schreibt die Access-Logs nun nach `/var/log/nginx/json_access.log`.
- Die Logs enthalten detaillierte, strukturierte Metadaten (u.a. HTTP-Methode, Pfad, Statuscode, Upstream-Antwortzeiten, SSL-Zertifikat-Metadaten).

## Begründung

- **Maschinenlesbarkeit:** JSON kann von Tools wie `jq`, Splunk, ElasticSearch oder dem ShieldPM-eigenen Analytics-Parser ohne komplexe Regex-Regeln gelesen werden.
- **Leistungsfähigkeit:** Die Extraktion spezifischer Felder (z.B. Latenz pro Request) ist in Node.js durch `JSON.parse()` wesentlich performanter und sicherer als Text-Parsing.
- **Sicherheitsintegration:** Tools wie CrowdSec profitieren massiv von JSON, da die Parser weniger fehlertolerant sein müssen und IP/User-Agent-Daten sauber getrennt sind.

## Alternativen

- Beibehaltung des `combined` Log-Formats (verworfen, da es bei komplexen Headern oder Escaping schnell korrumpiert).
- Weiterleitung an einen Syslog-Daemon (verworfen, da ShieldPM standardmäßig autonom ohne externe Logging-Infrastruktur laufen soll).

## Konsequenzen

### Positiv

- Das Analytics-Modul kann Logs zuverlässiger und schneller auswerten.
- Einfachere Anbindung an externe SIEM-Systeme.

### Negativ

- JSON-Logs verbrauchen pro Request etwas mehr Speicherplatz auf der Festplatte als kompakte Text-Logs.
- Nutzer, die eigene Bash-Skripte mit `awk` oder `grep` auf den Logs genutzt haben, müssen diese auf `jq` umstellen.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
- [Analytics-Modul](../module/analytics.md)
