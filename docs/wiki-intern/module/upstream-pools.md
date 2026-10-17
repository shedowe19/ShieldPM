# Upstream-Pools, Failover und Canary

## Zweck und Kontext

HTTP-/HTTPS-Proxy-Hosts können unter `meta.upstream_pool` mehrere gleichartige Ziele verwalten.
Der bisherige Einzel-Upstream bleibt bei deaktiviertem Pool unverändert. Die Oberfläche verwendet
wegen der zentralen API-Konvertierung die entsprechenden Camel-Case-Feldnamen.

## Wichtige Dateien

- `backend/lib/host-traffic-policy.js` — Eingabeprüfung, Normalisierung und Erhalt anderer Metadaten.
- `backend/internal/host-traffic-policy.js` — Renderdaten und begrenzte TCP-Beobachtungen.
- `backend/templates/_upstream_pool.conf` — Upstream-Gruppe mit gemeinsamem Fehlerzustand.
- `backend/templates/_pool_proxy_headers.conf` und `_pool_proxy_settings.conf` — Weiterleitung.
- `frontend/src/modals/ProxyHostUpstreamPoolTab.tsx` — Ziele und Verteilung im Hostdialog.
- `backend/routes/nginx/host_traffic_policy.js` — autorisierte Statusabfrage.

## Konfiguration und Verhalten

Ein aktivierter Pool benötigt mindestens ein primäres Ziel und erlaubt höchstens 16 eindeutige
Adressen. Jedes Ziel besitzt eine stabile ID, einen Anzeigenamen, Host/IP, Port, Gewicht von 1 bis
1000, Backup-Status sowie `max_fails` und `fail_timeout`. Alle Ziele verwenden das HTTP- oder
HTTPS-Schema des Proxy-Hosts. IPv6-Literale werden vor der Nginx-Ausgabe geklammert.

Nginx verteilt primäre Ziele nach Gewicht; damit kann beispielsweise ein Gewicht 9:1 eine
Canary-Version mit ungefähr zehn Prozent beteiligen. Das ist keine Garantie für einen einzelnen
kleinen Request-Ausschnitt. Backupziele werden verwendet, wenn primäre Ziele entsprechend den
passiven Fehlerregeln ausfallen. Nach dem Fehlerzeitfenster versucht Nginx ein primäres Ziel erneut.
Die Anwendung schreibt keine vermeintlichen Nginx-Gesundheitszustände aus dem UI zurück.

Die Gruppe erhält eine eigene Shared-Memory-Zone und einen begrenzten Keepalive-Pool. HTTP Host
bleibt standardmäßig der besuchte Hostname. `host_header` kann ihn ausdrücklich ersetzen;
`tls_server_name` steuert davon unabhängig den HTTPS-SNI-Namen. Ohne eigenen SNI-Namen wird der
Host-Header beziehungsweise Besucherhostname verwendet. Die TLS-Verifikation ist für neue Pools
standardmäßig eingeschaltet und verwendet den System-Truststore. Eine ausdrückliche Deaktivierung
ist im Formular sichtbar.

GET-Anfragen können bei Transportfehlern oder 502/503/504 ein anderes Ziel versuchen. Die
Nginx-Option `non_idempotent` wird niemals aktiviert: Bereits zum Ziel versandte POST-/PATCH-/LOCK-
Anfragen werden nicht an einen zweiten Server wiederholt. Vor dem Versand fehlgeschlagene
Verbindungen können weiterhin ein anderes Ziel versuchen. WebSocket-Upgrades behalten Host und
Upgrade-Header. Pool-Ziele gelten für die erzeugte Standardroute und Upload-Relay-Routen;
eigene Custom-Locations behalten ihren eigenen Upstream.

Aktivierte Pools unterstützen keine im Einzel-Upstream eingebetteten Pfade und keine freie
Advanced-Nginx-Konfiguration. Diese Abgrenzung verhindert, dass eine zweite manuelle Rootroute
oder ein eigenes `proxy_pass` die verwaltete Zielauswahl verdeckt.

## Beobachtung und Rechte

`GET /api/nginx/proxy-hosts/:id/upstream-pool/status` verwendet dieselbe aktuelle Host-Sichtbarkeit
wie der normale Hostabruf. Die Antwort kennzeichnet ihre Messung ausdrücklich als `tcp`.
Jeweils höchstens vier kurzlebige Verbindungen laufen gleichzeitig; ein Versuch endet nach zwei
Sekunden. Eine gemeinsame, fünf Sekunden gültige Promise verhindert doppelte Abfragen desselben
aktuellen Pools. Der Cache ist auf 100 Hosts begrenzt; die Route begrenzt manuelle Aufrufe zusätzlich.

Diese TCP-Momentaufnahme weist eine annehmbare Verbindung nach, keine funktionierende Anwendung,
keine korrekte HTTPS-Vertrauenskette und nicht Nginx' internen passiven Fehlerzustand. Ein geänderter
Formularentwurf zeigt keine alte Messung eines anderen Hosts/Ports unter derselben Ziel-ID an.
Die beobachteten Routingzähler stammen aus maximal dem letzten MiB des privaten Traffic-Logs.
Sie vergleichen vollständige IP:Port-Ziele einschließlich IPv6 und Wiederholungsversuchen.
Für DNS-Ziele ist der Zähler nicht verfügbar (`null`), weil Nginx aufgelöste IP-Adressen
protokolliert und mehrere Zielnamen auf dieselbe Adresse zeigen können.
Zusätzlich liefert `monitor` je Ziel die letzte akzeptierte aktive HTTP-/TCP-Prüfung des
Host-Monitors. Diese Beobachtung läuft nach fünf Minuten ab und gehört zur aktuellen Poolrevision.
Die Oberfläche zeigt sie getrennt von der TCP-Momentaufnahme. Der aktive Host-Monitor berücksichtigt
primäre und Backupziele innerhalb seines gemeinsamen Zeitbudgets; ein gesundes geprüftes Ziel
verhindert einen falschen Ausfallalarm allein wegen eines nicht erreichbaren alten Einzel-Upstreams.

## Abhängigkeiten und Prüfung

Die Funktion verwendet die vorhandenen Nginx-HTTP-Upstream-/Proxy-Module und keine kommerziellen
Health-Check-Direktiven. Der lokale Lauf von
`backend/test/integration/host-traffic-policy-runtime.spec.js` prüft echte gewichtete Upstreams,
Failover und Rückkehr, Schutz gegen POST-Wiederholung, unabhängigen Host/SNI, WebSocket 101 und
öffentliche Uploadweiterleitung mit IPv4, privater DNS-Fixture sowie nackten und geklammerten IPv6-Literalen. Aktivierung des Tests: `TRAFFIC_SMOKE_NGINX_BIN` auf ein geeignetes
ShieldPM-Nginx setzen; eine abweichende Lua-Installation benötigt `TRAFFIC_SMOKE_LUA_DIRECTORY`.
Die isolierte Transport-Fixture lässt ausschließlich die ModSecurity-Body-Limit-Direktiven weg;
deren tatsächliche WAF-Verträglichkeit bleibt Bestandteil des getrennten Firewall-Smokes.

## Verwandte Seiten

- [Nginx-Engine](./nginx-engine.md)
- [Proxy-Cache](./proxy-cache.md)
- [Proxy-Host-Monitor](./proxy-host-monitor.md)
- [Upload Relay](./upload-relay.md)
