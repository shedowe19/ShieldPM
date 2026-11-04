# Verwalteter Proxy-Cache

## Zweck und Kontext

`meta.cache_policy` verwaltet für HTTP-/HTTPS-Proxy-Hosts einen tatsächlich wirksamen Nginx-
Antwortcache. `caching_enabled` bleibt als kompatibler Schalter für statische Assets verfügbar.
Der Cache wird nicht mehr zur Auswahl eines WAF-Regelwerks verwendet.

## Wichtige Dateien

- `backend/lib/host-traffic-policy.js` — Cache-/Routenprüfung und kompatible Normalisierung.
- `backend/internal/host-traffic-policy.js` — Speicher, Statistik, Purge und Logbegrenzung.
- `backend/templates/_traffic_http.conf` — Cache-Zone, Maps und Traffic-Logformat.
- `backend/templates/_proxy_cache_location.conf` — sichere Location-Direktiven.
- `frontend/src/modals/ProxyHostCacheTab.tsx` — Routen, TTL, Cache-Key und Purge.
- `backend/migrations/20261017190100_seed_proxy_waf_ruleset.js` — bestehende Schutzwirkung erhalten.

## Konfiguration

Ein Host erhält eine eigene Zone `spm_cache_ID` und ein eigenes Verzeichnis unter
`<DATA_PATH>/nginx/cache/host-ID` (`DATA_PATH` standardmäßig `/data`). Das normale Limit beträgt
256 MiB; konfigurierbar sind 16 bis 10.240 MiB. Inaktive Einträge werden standardmäßig nach
24 Stunden entfernt. Die Konfiguration erlaubt höchstens 16 Verzeichnispräfixe mit eigener TTL
zwischen einer Sekunde und einem Tag. Präfixe enden mit `/`; Pfade, Sonderzeichen und
reservierte Upload-/Challenge-Namensräume werden geprüft.

`/` steuert die erzeugte Standardlocation. Zusätzliche Präfixe erhalten eine entsprechende
Proxy-Location mit demselben Standard-Upstream; bereits vorhandene Custom-Locations erhalten
nur bei einer exakt passenden Cache-Route deren TTL und behalten ihr eigenes Ziel. Nicht
aufgeführte Custom-Locations bleiben ungecached. Freie Advanced-Nginx-Konfiguration ist bei
neu ausdrücklich verwalteten Cache-Policies ausgeschlossen. Bestehende Legacy-Flags verhindern
den Start älterer Hosts mit Advanced-Konfiguration nicht; manuelle Locations werden dabei
nicht automatisch umgeschrieben.

Standardmäßig werden nur bekannte statische Dateiendungen gespeichert. Eine ausdrückliche
Umstellung erlaubt andere öffentliche Antworten. Der Cache-Key enthält Scheme, Host und originale
Request-URI; optional dürfen Query-Parameter ausschließlich im Static-Assets-Modus ignoriert
werden. Ein zusätzlicher Hash aus Origin, Pool, Locations und Cache-Policy trennt
Konfigurationsrevisionen: Eine Origin- oder Policyänderung verwendet keine alten Antworten.
Gleichzeitige erste Abrufe teilen sich über `proxy_cache_lock` den Cache-Aufbau.

## Schutz privater Inhalte

Es werden ausschließlich erfolgreiche 200-Antworten auf GET/HEAD gespeichert; HEAD verwendet
Nginx' GET-Konvertierung. Folgende Fälle umgehen sowohl das Lesen als auch das Schreiben:

- Authorization-Header, Cookie-Header oder WebSocket-Upgrade.
- Hosts mit einer Access List.
- Antworten mit `Set-Cookie`; die native Behandlung von `private`, `no-store`, `Vary` und
  anderen Origin-Cache-Anweisungen wird nicht abgeschaltet.

Ein URI im geschützten Namensraum erhält dadurch keine vorher gespeicherte öffentliche Antwort.
Der `X-ShieldPM-Cache`-Header macht MISS/HIT/BYPASS sichtbar, ohne geerbte Sicherheitsheader zu
ersetzen. Der Cache ist kein Ersatz für die korrekten Datenschutz- und Cache-Header des Origins.

## Purge, Statistik und Aufbewahrung

`DELETE /api/nginx/proxy-hosts/:id/cache` benötigt `proxy_hosts:update` sowie den normalen
Hostabruf mit aktueller Owner-Sichtbarkeit und die gemeinsame CSRF-Prüfung. Ohne Query wird
nur dieser Host geleert; `?path=/assets/app.js` entfernt die exakte ursprüngliche Request-URI
für HTTP/HTTPS und die gespeicherten Host-Aliase. Wildcard-/Regexhosts verwenden den vollständigen
Host-Purge, weil nicht alle tatsächlichen Hostnamen aufzählbar sind. Pfade wählen keine
Dateisystempfade: Die Implementierung berechnet nur feste Cache-Hashes und folgt keinen
Cache-Verzeichnis-Symlinks. Auch alle Vorfahren unterhalb von `DATA_PATH` werden geprüft;
die Suche bleibt auf Nginx-Hashverzeichnisse der Ebenen `1:2` begrenzt. Host-IDs werden vor
Dateizugriffen strikt als positive sichere Ganzzahlen geprüft und neu numerisch kanonisiert.
Der vollständige Purge ist auch nach dem Deaktivieren des Caches
verfügbar; ein exakter URI-Purge benötigt eine aktive Policy zur eindeutigen Key-Berechnung.
Nach erfolgreichem Entfernen eines Hosts werden dessen Cacheverzeichnis und private Traffic-Logs
entfernt. Die Purge-Aktion erscheint im Audit-Log.

`GET .../:id/cache/status` enthält Konfiguration, HIT/MISS/BYPASS-Zähler und eine Trefferquote.
Die Stichprobe umfasst höchstens das letzte MiB von `traffic_ID.log`, keine Lebenszeitzähler.
BYPASS-Anfragen gehören nicht in den Nenner der HIT-Quote. Das getrennte Traffic-Log speichert
Zeit, Upstream-Adresse, Cache-Zustand und HTTP-Status, keine Besucher-IP oder URI. Die bestehende
JSON-Analytics-Protokollierung bleibt zusätzlich aktiv.

Die Backend-Wartung prüft die eigenen Logs minütlich und kopiert/trunkiert sie oberhalb von
10 MiB mit höchstens einer Vorgängerdatei. Lesezugriffe öffnen Logs ohne Symlink-Folgen;
die Rotation verwendet einen exklusiv erzeugten Zwischenspeicher und ersetzt die
Vorgängerdatei atomar, statt einem eventuell vorhandenen Symlink zu folgen. Ein laufender Request kann daher noch in eine neue
Stichprobe fallen; Messzähler werden nicht als abrechnungsfeste Statistik dargestellt. Der
optionale System-Logrotate erfasst ebenfalls `traffic_*.log` mit Größenrotation. Beim Stoppen
werden Wartungstimer und laufende Wartung sauber beendet.

## WAF-Migration und Kompatibilität

`meta.waf_ruleset` besitzt die unabhängigen Werte `base` und `crs`. Die Migration übernimmt für
bestehende Hosts die frühere effektive Auswahl: altes Cache-Flag an → CRS, aus → Basisregeln.
Andere Metadaten und eine bereits ausdrücklich gesetzte Auswahl bleiben erhalten. Neue Hosts
verwenden standardmäßig CRS. Spätere Cache-Toggles ändern die Schutzwirkung nicht. Die Migration
behält die ausdrückliche Auswahl auch bei einem Downgrade, statt Schutzregeln still umzuschalten.
Legacy-Flags auf path/php/grpc/terminal-Hosts erhalten eine deaktivierte Cache-Policy; solche
Hosts rendern weiter. Ein neuer ausdrücklich aktivierter Proxy-Cache auf diesen Schemas wird
mit einer verständlichen Eingabevalidierung abgewiesen.

## Prüfung und Grenzen

`host-traffic-policy.spec.js` prüft Grenzen, unbekannte Metadaten, Legacy-JSON, WAF-Migration,
Purge-Berechtigung und Host-Isolation, Symlinks und begrenzte Logbeobachtung. Der echte Nginx-
Integrationstest prüft HIT/MISS, gemeinsame GET/HEAD-Antworten, Auth-/Cookie-/Origin-Privacy-
Bypass, unterschiedliche Route-TTLs und tatsächliches Purge.

## Verwandte Seiten

- [Upstream-Pools](./upstream-pools.md)
- [Nginx-Engine](./nginx-engine.md)
- [Access-Lists](./access-lists.md)
- [Analytics](./analytics.md)
- [Tests](../entwicklung/tests.md)
