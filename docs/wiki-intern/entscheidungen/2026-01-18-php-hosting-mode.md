# ADR: Native PHP Hosting Mode

## Titel

Einführung eines nativen PHP-Hosting-Modus für Proxy Hosts (FastCGI).

## Status

`Akzeptiert` (Implementiert am 18.01.2026)

## Kontext

Bisher war ShieldPM strikt ein Reverse-Proxy, der den Traffic an externe Docker-Container oder Server weiterleitete. Für gängige monolithische PHP-Anwendungen (wie Nextcloud oder einfache WordPress-Seiten) war dies oft ein Overhead, da Nutzer einen separaten Webserver-Container aufsetzen mussten, anstatt den bereits in ShieldPM integrierten Nginx zu nutzen.

## Entscheidung

Ein neuer "Hosting-Modus" wurde in die Proxy-Hosts integriert, erkennbar an `scheme=path`.
- ShieldPM installiert `php-fpm` und kommuniziert direkt via UNIX-Socket (`/run/phpXX.sock`).
- Der Nginx-vhost-Template wurde tiefgreifend erweitert, um `fastcgi_pass` anstelle von `proxy_pass` zu nutzen, wenn das Scheme auf `path` (lokaler Pfad) gesetzt ist.
- Volle Unterstützung für `PATH_INFO`, `.mjs`-Mime-Types und dynamisches Überschreiben der `php.ini` via Dashboard.

## Begründung

- **Ressourcen-Effizienz:** Wegfall von redundanten Webserver-Schichten (Nginx -> Nginx/Apache -> PHP) für einfache Workloads.
- **UX-Verbesserung:** Ermöglicht die Bereitstellung kompletter Web-Applikationen direkt aus dem ShieldPM-Dashboard heraus, sofern die Dateien via Volume/GitOps im `/data/`-Ordner bereitliegen.

## Konsequenzen

### Positiv
- ShieldPM entwickelt sich vom reinen Proxy zu einer "All-in-One" Hosting-Plattform für leichtgewichtige Apps.

### Negativ
- Höhere Sicherheitsrisiken (RCE), da PHP direkt im ShieldPM-Container/Host ausgeführt wird.
- Erhöhte Komplexität in der Nginx-Template-Engine, um Konflikte zwischen Proxy- und FastCGI-Locations zu vermeiden.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
