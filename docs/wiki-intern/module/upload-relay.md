# Resumable Upload Relay

## Zweck

Das optionale **Upload-Relay** eines Proxy Hosts verwendet immer den bereits konfigurierten privaten Upstream und den ursprünglichen Request als Zielvertrag – es gibt kein separates Zielpfad-Feld. ShieldPM leitet Uploads transparent an `forward_host` mit derselben Request-URI, Methode und den relevanten Headern weiter. Bei Protokollen mit einer expliziten Zielinformation, etwa Nextcloud-WebDAV mit `Destination`, bleibt diese Information unverändert erhalten. Damit bestimmt die Anwendung selbst den endgültigen Dateiordner.

ShieldPM erhöht für den Host die öffentliche Request-Grenze auf die konfigurierte Chunk-Größe und deaktiviert Request-Buffering. Clients müssen große Dateien weiterhin mit ihrem nativen Protokoll in Requests unter dem CDN-Limit aufteilen; ShieldPM errät oder zerlegt keine beliebigen Formularuploads.

## Aktivierung

Im Proxy-Host-Dialog unter **Erweitert → Upload-Relay** aktivieren. Die Anwendung bestimmt den Zielort aus ihrem Upload-Protokoll; ShieldPM verwendet nur den bereits vorhandenen privaten Upstream des Proxy Hosts:

| Einstellung           |                   Standard | Bedeutung                                                                                                                            |
| --------------------- | -------------------------: | ------------------------------------------------------------------------------------------------------------------------------------ |
| Optionaler tus-Pfad   |        `/_shieldpm-upload` | Ein tus-fähiger Upstream bedient diesen Originalpfad transparent selbst.                                                             |
| Nextcloud-WebDAV-Pfad | `/remote.php/dav/uploads/` | Automatisch erkannt: URI und `Destination` gehen unverändert zum privaten Upstream; akzeptiert Nextcloud-Standardchunks bis 100 MiB. |
| Chunk-Größe           |        `83886080` (80 MiB) | Öffentliche Obergrenze je Request; zwischen 5 MiB und 90 MiB.                                                                        |

Eine Proxy-Host-Access-List ist **optional**. Falls eine Liste gesetzt ist, gelten ihre IP-/Basic-/SSO-Regeln unverändert für den Uploadpfad; eine `satisfy any`-Liste mit `allow all` gilt dabei als öffentlich und kann kein Relay schützen. Ohne Access List ist der Uploadpfad öffentlich erreichbar; deshalb sollten die Speicher- und Dateilimits bewusst gewählt und bei Bedarf eine vorgeschaltete Zugriffskontrolle (z. B. Cloudflare Access) eingesetzt werden. Bei `pass_auth: false` wird ein Basic-`Authorization`-Header ausdrücklich nicht zum Origin weitergereicht. Das Relay ist standardmäßig deaktiviert.

## Automatische Zielermittlung

ShieldPM ermittelt den Transportweg ohne ein zusätzliches Formularfeld:

- **WebDAV mit `Destination`**: Der Header bleibt erhalten. Nextcloud und andere WebDAV-Server wählen damit ihren endgültigen Dateiordner selbst.
- **tus oder ein anderes natives Upload-Protokoll**: Methode, URI, Body und Protokollheader gehen unverändert an den vorhandenen Upstream. Ein tus-fähiger Upstream behält damit seine eigenen Upload-IDs, Resumes und finalen Ziele.
- **Nichtstandardisierte Uploads**: ShieldPM leitet sie transparent an `forward_host` und die originale URI weiter. Es erfindet keinen Dateipfad und führt keine unsichere nachträgliche Zusammenführung aus.

Bekannte, ausdrücklich aktivierte Upload-Namensräume erhalten zusätzlich `proxy_buffering off`, `proxy_request_buffering off`, einen langen Origin-Timeout sowie ein auf die konfigurierte Chunk-Größe angehobenes ModSecurity-Request-Body-Limit. Die übrigen ModSecurity-Regeln bleiben aktiv. Access List, TLS und die gesamte sonstige Proxy-Host-Konfiguration bleiben ebenfalls wirksam.

## Grenzen

Ein Reverse Proxy kann eine beliebige einzelne Browser-Formularanfrage nicht transparent in kleinere Anfragen zerlegen: Das Zielsystem bestimmt dabei Feldnamen, Authentifizierung, Checksumme und Abschlusssemantik. Für Dateien oberhalb eines CDN-Request-Limits muss der Client bzw. der Upstream daher ein eigenes Chunking-Protokoll wie Nextcloud-WebDAV oder tus verwenden. ShieldPM transportiert dieses Protokoll ohne Zielpfad-Doppelpflege und verhindert selbst keine Anwendungsspezifika.

## Verhalten bei Fehlern

- HTTP-Status und Fehler des privaten Upstreams gehen direkt an den Client zurück.
- Ein Chunking-fähiger Upstream entscheidet selbst über Wiederaufnahme, Integritätsprüfung und Aufräumen.
- Ohne erklärbaren Zielhinweis bleibt der Request transparent; es wird nie auf einen geratenen Pfad geschrieben.
- Bei `pass_auth: false` wird Basic-`Authorization` auch bei einer IP-only Access List nicht an den Upstream weitergereicht.

## Verwandte Seiten

- [Proxy Host](proxy-host.md)
- [Nginx Engine](nginx-engine.md)
- [Datenbank-Migrationen](../daten/migrationen.md)
