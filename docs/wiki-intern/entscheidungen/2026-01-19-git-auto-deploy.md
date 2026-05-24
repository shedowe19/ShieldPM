# ADR: Git Auto-Deploy für Proxy Hosts

## Titel

Erweiterung von Proxy Hosts um eine native Git-Synchronisationsfunktion zum direkten Hosten statischer Webseiten.

## Status

`Akzeptiert` (Implementiert am 19.01.2026 in PR #248)

## Kontext

ShieldPM fungierte klassischerweise nur als reiner Reverse Proxy, der Anfragen an Upstream-Server (Docker-Container oder andere IPs) weiterleitete. Nutzer wollten jedoch häufig einfache statische Seiten (wie Blogs, Wartungsseiten oder Doku-Seiten) hosten, ohne dafür einen separaten Nginx-Container betreiben zu müssen. Das manuelle Hochladen von HTML-Dateien per SFTP war ineffizient.

## Entscheidung

Ein "Git Auto-Deploy" Modul wurde in das Backend (`backend/internal/git-deploy.js`) integriert.

- Proxy Hosts haben nun einen speziellen Modus: Anstatt auf einen Upstream zu verweisen, können sie direkt aus einem Git-Repository (GitHub, GitLab, Gitea) bedient werden.
- Das Backend zieht das Repository asynchron (über Webhooks oder manuelle Synchronisierung im UI) in ein dediziertes Verzeichnis auf dem Host (`/data/git-deploy/<host_id>`).
- Die generierte Nginx-Konfiguration konfiguriert den `root`-Pfad auf dieses geklonte Verzeichnis und bedient die statischen Files (HTML, JS, CSS) direkt.

## Begründung

- **Vollständiges Ökosystem:** ShieldPM wird dadurch zu einer vollwertigen Static-Site-Hosting-Plattform (vergleichbar mit GitHub Pages oder Netlify).
- **Performance:** Nginx bedient statische Dateien ohne Upstream-Overhead extrem effizient.

## Konsequenzen

### Positiv

- Enormer Mehrwert für Entwickler, die schnell statische Projekte deployen wollen.
- Keine zusätzlichen Container nötig.

### Negativ

- Das Backend muss nun Festplatten-Quotas für die Git-Repositories verwalten, um zu verhindern, dass große Repositories den Speicherplatz des ShieldPM-Servers füllen.
- Erhöhte Komplexität bei der Nginx-Template-Generierung (`root` vs `proxy_pass`).

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
