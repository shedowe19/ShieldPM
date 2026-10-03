# IP-Firewall für Proxy-Hosts

## Zweck

Die IP-Firewall sperrt Besucher anhand ihrer IPv4-/IPv6-Adresse oder eines CIDR-Netzes auf HTTP-Ebene. Listen werden zentral gepflegt; jeder Proxy-Host aktiviert die Firewall und wählt seine Listen unabhängig. Eine eigene Sperrseite erklärt den tatsächlichen Regel- oder Listentreffer.

Ein Eintrag in einer VPN- oder Rechenzentrumsliste ist kein Nachweis eines Angriffs. Die Firewall setzt die vom Betreiber gewählte Zugriffsregel um; sie ergänzt Access-Lists und WAF-Integrationen.

## Kontext

Die Einstellungen liegen in `proxy_host.meta.ip_firewall`. Bestehende Hosts ohne diese Metadaten bleiben unverändert; die Standardvorgabe ist `enabled: false`. Die Oberfläche verwendet durch die API-Konvertierung die entsprechende CamelCase-Struktur `meta.ipFirewall`.

Listen verwenden die vorhandene Berechtigung `access_lists` und deren Eigentümersichtbarkeit. Proxy-Host-Berechtigungen bestimmen weiterhin, welcher Host bearbeitet werden darf. Neu zugewiesene Listen werden vor dem Speichern beziehungsweise vor einer Konfigurationsvorschau autorisiert. Der endgültige Host-Schreibvorgang prüft auch bestehende Referenzen unter derselben Nginx-Konfigurationssperre wie das Löschen von Listen; eine gleichzeitige Löschung kann keine verwaiste Zuordnung erzeugen. Diese Prüfung gilt auch bei deaktivierter Firewall und beim GitOps-Import.

## Wichtige Dateien

- `backend/migrations/20261003000000_add_firewall_lists.js` — Tabelle `firewall_list`.
- `backend/models/firewall_list.js` — Objection-Modell, Zeitstempel und Boolean-Konvertierung.
- `backend/lib/firewall-addresses.js` — TXT-Parser und IP-/CIDR-Normalisierung.
- `backend/lib/firewall-download.js` — begrenzter, SSRF-geschützter HTTPS-Abruf.
- `backend/lib/firewall-list-validation.js` — gemeinsame Validierung für API und Backup-Import ohne Download.
- `backend/lib/firewall-policy.js` — Prüfung der Host-Regeln.
- `backend/internal/firewall-policy.js` — Autorisierung zugewiesener Listen.
- `backend/internal/firewall-list.js` — Listenverwaltung und Aktualisierungen.
- `backend/routes/nginx/firewall_lists.js` — authentifizierte API.
- `backend/internal/nginx.js`, `backend/templates/proxy_host.conf` — Einbindung in die Host-Konfiguration.
- `backend/lib/firewall-render.js` — kompiliert die Host-Regeln und einmal je Quelle gespeicherte Begründungen.
- `backend/templates/_ip_firewall_geo.conf`, `_ip_firewall.conf`, `ip-blocked.html` — Geo-Auswertung, verpflichtender Filter und Sperrseite.
- `frontend/src/api/backend/firewallLists.ts`, `frontend/src/hooks/useFirewallLists.ts` — API und React-Query-Hooks.
- `frontend/src/pages/Firewall.tsx`, `frontend/src/modals/FirewallListModal.tsx` — Listenübersicht unter `/firewall`, TXT-Vorschau und X4BNet-URL-Vorgaben.
- `frontend/src/modals/ProxyHostFirewallSettings.tsx`, `ProxyHostSecurityTab.tsx` — Einstellungen im Sicherheitstab.

## Datenmodell

### Zentrale Listen

`firewall_list` speichert `id`, `owner_user_id`, `created_on`, `modified_on`, `is_deleted`, `name`, `reason`, `description`, `source_type`, `source_url`, `update_interval_hours`, `enabled`, `entries`, `entry_count`, `last_updated_on` und `last_error`.

- `source_type` ist `manual` für eingefügten beziehungsweise hochgeladenen Text oder `url` für ein HTTPS-Abonnement.
- `entries` enthält die normalisierte Liste; CIDR-Netze werden nicht in einzelne Adressen aufgelöst.
- `reason` ist die öffentliche Begründung eines Listentreffers. `description` dient der Verwaltung.
- `name` und `reason` sind Pflichtfelder; ihre Grenzen sind 255 beziehungsweise 2000 Zeichen. `description` darf bis zu 4000 Zeichen enthalten. Quellen sind standardmäßig aktiviert; das setzt keine Host-Firewall automatisch aktiv.
- Eine deaktivierte Quelle bleibt gespeichert und zugeordnet, trägt aber keine aktiven Sperren bei.
- Eine verwendete Liste kann nicht gelöscht werden. Zuerst müssen die Host-Zuordnungen entfernt werden, auch bei derzeit deaktivierter Host-Firewall.

### Einstellungen pro Proxy-Host

| Backend-Feld     | Standard | Bedeutung                                                                 |
| ---------------- | -------- | ------------------------------------------------------------------------- |
| `enabled`        | `false`  | Aktiviert die Firewall nur für diesen Host.                               |
| `list_ids`       | `[]`     | IDs der ausgewählten zentralen Listen, maximal 32.                        |
| `allowlist`      | `[]`     | IP-/CIDR-Ausnahmen, maximal 1000.                                         |
| `denylist`       | `[]`     | Maximal 1000 Regeln mit `address` und öffentlichem `reason`.              |
| `public_message` | `""`     | Zusätzlicher öffentlicher Erklärungstext, maximal 2000 Zeichen.           |
| `support_url`    | `""`     | Optionaler HTTP(S)-Kontaktlink ohne eingebettete Zugangsdaten.            |
| `internal_note`  | `""`     | Verwaltungsnotiz, maximal 2000 Zeichen; wird nicht öffentlich ausgegeben. |

Der Normalisierungshelfer dedupliziert `list_ids` und `allowlist`; das JSON-Schema fordert eindeutige `list_ids`. Doppelte manuelle Sperradressen sind ein Validierungsfehler. Ein manuelles `reason` darf höchstens 1000 Zeichen enthalten. Unbekannte Felder, ungültige Adressen, ungültige Typen und Nullbytes in Textfeldern werden zurückgewiesen.

## TXT-Import

Das Format enthält eine IP-Adresse oder ein CIDR-Netz pro Zeile:

```text
# Beispieladressen, keine produktive Sperrliste
203.0.113.24
198.51.100.0/24
2001:db8:1234::/48 # Kommentar
```

Der Parser akzeptiert IPv4, IPv6, LF/CRLF/CR, ein UTF-8-BOM am Anfang, Leerzeilen und Kommentare ab `#`. Netze werden auf ihre Netzwerkadresse normalisiert; `/32` beziehungsweise `/128` werden als Einzeladressen gespeichert. Äquivalente Schreibweisen werden dedupliziert. Hostnamen, URL-Zeilen, IPv6-Zonenkennungen und ungültige Präfixe sind nicht zulässig.

IPv4-gemappte IPv6-Adressen werden als IPv4 normalisiert, damit die Nginx-`geo`-Suche dieselben Regeln verwendet: `::ffff:198.51.100.23` wird zu `198.51.100.23`; `::ffff:198.51.100.23/120` wird zu `198.51.100.0/24`. Für gemappte CIDRs muss das Präfix mindestens 96 sein; das IPv4-Präfix ist der Wert minus 96. Kleinere gemappte Präfixe werden ausdrücklich zurückgewiesen, weil sie über den IPv4-Mappingbereich hinausgehen.

Die Vorschau liefert normalisierte `entries`, `entry_count`, die Zahl `duplicates`, fehlerhafte Zeilen als `invalid: [{line, value}]` und `totalLines`. Eine Vorschau schreibt keine Liste. Fehlerhafte Zeilen müssen vor dem Speichern korrigiert werden; auch eine deaktivierte Liste darf keine ungültigen Einträge enthalten. Ein manuelles leeres Regelwerk ist zulässig; leere heruntergeladene Listen werden zurückgewiesen.

Die Grenzen gelten für den gesamten Text: **8 MiB UTF-8-Daten und 200000 Zeilen**, einschließlich Kommentar- und Leerzeilen. Die Oberfläche liest TXT-Dateien als Text und sendet denselben Inhalt wie beim direkten Einfügen. Der Dialog verlangt vor einer manuellen Speicherung eine aktuelle, fehlerfreie Vorschau mit mindestens einem Eintrag; die Backend-API akzeptiert auch bewusst leere manuelle Listen.

## API

Alle Pfade beziehen sich auf `/api/nginx/firewall-lists` und verwenden die bestehende Authentifizierung und API-Fehlerbehandlung.

| Methode und Pfad    | Verhalten                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `GET /`             | Sichtbare Listen und Aktualisierungsstatus ohne `entries` auflisten; HTTP 200.                          |
| `POST /`            | Liste erstellen und validieren; vollständige Liste mit HTTP 201.                                        |
| `POST /preview`     | TXT-Inhalt prüfen; keine Datenbank- oder Nginx-Änderung.                                                |
| `GET /:id`          | Autorisierte Liste einschließlich editierbarer Einträge lesen.                                          |
| `PUT /:id`          | Liste ändern und betroffene Hosts neu konfigurieren.                                                    |
| `DELETE /:id`       | Unbenutzte Liste soft-deleten; `true` mit HTTP 200. Verwendete Listen ergeben einen Validierungsfehler. |
| `POST /:id/refresh` | URL-Quelle mit leerer Payload `{}` sofort erneut abrufen. Manuelle Listen sind nicht refreshbar.        |

Die Backend-Payloads verwenden Snake Case. Beispiele für Listenfelder sind `source_type`, `source_url` und `update_interval_hours`; der Frontend-API-Client konvertiert diese zu `sourceType`, `sourceUrl` und `updateIntervalHours`. `entries` wird nur bei einer manuellen Quelle geschrieben; URL-Quellen lesen es ausschließlich aus dem Download. Die Host-Firewall wird über die vorhandene Proxy-Host-API in `meta` gespeichert und benötigt keinen eigenen Host-Endpunkt.

## URL-Abonnements

Nur HTTPS-Quellen sind als Listenabonnement zulässig. Die URL darf höchstens 2048 Zeichen lang sein und weder Zugangsdaten noch Fragment enthalten. Alle DNS-Antworten eines Ziels müssen öffentlich routbare Adressen sein; der HTTPS-Verbindungsaufbau wird auf diese geprüften Adressen festgelegt. Private, reservierte, Loopback-, Link-Local-, Multicast- und Metadatenziele sind ausgeschlossen, auch bei IPv4-in-IPv6-Adressen. Bis zu drei Redirects werden jeweils erneut geprüft.

Der Abruf verwendet direktes natives HTTPS mit Zertifikatsprüfung und ohne Umgebungs-Proxies. Ein gemeinsames **15-Sekunden-Limit** umfasst DNS, Redirects und Antwortdaten. Nur HTTP 200, unkomprimierter vollständiger Inhalt und gültiges UTF-8 werden akzeptiert; die Rohantwort darf höchstens 8 MiB enthalten.

Das Aktualisierungsintervall beträgt **6 bis 168 Stunden**, standardmäßig 24 Stunden. Der Hintergrunddienst prüft sofort beim Start und danach jede Minute auf fällige aktivierte URL-Listen. Nach einem fehlgeschlagenen Versuch wartet er mindestens 15 Minuten bis zum nächsten automatischen Versuch. Deaktivierte Quellen werden nicht automatisch aktualisiert.

Ein Download wird vollständig eingelesen und geprüft, bevor die vorherige Liste ersetzt wird. HTTP-Fehler, Zeitüberschreitungen, leere Antworten und ungültige Listeneinträge erhalten den bisherigen gültigen Inhalt und `last_updated_on`; `last_error` zeigt die Ursache. Die Änderung betroffener aktiver Hosts erfolgt unter der Nginx-Konfigurationssperre: Datenbankänderung, gestagte Host-Dateien, `test()` und Reload. Bei Render-, Test- oder Reloadfehlern werden die vorherigen Listendaten und gestagten Host-Dateien wiederhergestellt und erneut geladen; Fehler beim Rollback werden separat protokolliert. Erfolgreiche Aktivierung löscht `last_error`.

### X4BNet-Vorgaben

| Vorgabe               | Inhalt                                       | Rohdatei                                                                             |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| VPN                   | Vom Anbieter als VPN eingeordnete Netze      | `https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt`        |
| VPN und Rechenzentren | Breitere Liste einschließlich Hosting-Netzen | `https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/datacenter/ipv4.txt` |

Die beiden Vorgaben bleiben getrennt auswählbar. ShieldPM liefert keine Kopie der Listen mit; die Oberfläche schlägt ihre HTTPS-URLs vor. Die TXT-Dateien enthalten keine individuelle Betreiberbegründung oder verlässliche Zuordnung zu einem bestimmten VPN-Anbieter. Öffentlich erscheinen deshalb die konfigurierte Listenbezeichnung und Begründung, keine erfundenen Anbieterinformationen.

Die Quelle [X4BNet/lists_vpn](https://github.com/X4BNet/lists_vpn) beschreibt Listen und Skripte unter MIT; die Attribution ist in `THIRD-PARTY-NOTICES.md` enthalten.

## GitOps und Wiederherstellung

`backend/internal/gitops.js` exportiert Firewall-Listen unter `config/firewall-lists/` mit Quellmetadaten, normalisiertem Cache und Aktualisierungsstatus. Die Host-Regeln bleiben in den exportierten Proxy-Host-Metadaten enthalten.

Beim Import werden Listen vor Proxy-Hosts verarbeitet. Der gemeinsame Validierungshelfer prüft Metadaten und gecachte IP-/CIDR-Einträge ohne einen Netzwerkabruf; eine Wiederherstellung benötigt deshalb keinen erfolgreichen Feed-Download. Ungültige Einträge verhindern den betreffenden Schreibvorgang. Referenzen werden vor dem Host-Schreibvorgang geprüft.

Das Pruning bisheriger Firewall-Listen wird bis nach sämtlichen erfolgreichen Importen sowie der validierten Nginx-Neugenerierung und dem Reload verschoben. Schlägt ein Import oder die Nginx-Aktivierung fehl, wird keine bisherige Liste durch dieses Pruning entfernt. Erst nach erfolgreicher Übernahme des gesamten Imports werden nicht mehr vorhandene Listen gelöscht; noch verwendete Listen bleiben auch dann geschützt. So stehen bisherige Zuordnungen bis zum Abschluss des Host-Restores weiter zur Verfügung.

Fehlt das Verzeichnis `firewall-lists` in einer älteren Sicherung, gilt das nicht als Löschauftrag: bestehende Listen bleiben erhalten. Der reguläre Abonnement-Timer kann aktivierte URL-Quellen nach der Wiederherstellung wieder aktualisieren.

## Nginx-Verhalten und Priorität

Die Listen werden mit Nginx-`geo` ausgewertet. Ein verpflichtender Filter auf Serverebene schützt den HTTP-Eingang des Hosts; die Entscheidung ist unabhängig von Basic Auth, OAuth2/OIDC und `satisfy any`.

1. Eine passende `allowlist`-Ausnahme hebt ausschließlich diese IP-Firewall-Sperre auf.
2. Ein manueller Sperrtreffer hat Vorrang vor einem zentralen Listentreffer.
3. Danach werden die aktivierten, ausgewählten Listen geprüft.
4. Ohne Sperrtreffer gelten die übrigen Host-Sicherheitsregeln unverändert.

Innerhalb der manuellen Regeln beziehungsweise der Listennetze wählt `geo` das längste passende CIDR-Präfix. Gleiche Netze aus mehreren Listen verwenden die erste zugeordnete Liste in `list_ids`. Eine breitere manuelle Sperre hat trotzdem Vorrang vor einem spezifischeren Listentreffer.

Ausnahmen umgehen weder Access-Lists noch SSO, mTLS, CrowdSec oder eine WAF. Die Firewall-Sperrseite wird nur für einen Firewall-Treffer ausgewählt; fremde 403-Antworten behalten ihren bestehenden Ablauf, insbesondere OAuth2-Loginweiterleitungen.

Die Prüfung erfasst Custom Locations, Upload-Relay-Routen und den ersten WebSocket-Handshake. Bei Anubis erfolgt sie am öffentlichen Eingang, nicht erst hinter dem PoW-Gate. Die ACME-Ausnahme gilt ausschließlich für die URI `/.well-known/acme-challenge/<token>` mit `[A-Za-z0-9_-]+` als Token, nicht für beliebige Unterpfade. Bereits bestehende WebSocket- oder Streaming-Verbindungen werden durch eine neue Regel nicht nachträglich beendet.

Die auswertbare Adresse ist die von Nginx bestimmte Besucher-IP. Hinter Cloudflare oder einem vorgeschalteten Proxy ist eine korrekt begrenzte Real-IP-Vertrauenskonfiguration erforderlich. Beliebige vom Besucher gesetzte Forwarded-Header dürfen nicht als vertrauenswürdige IP-Quelle dienen; siehe [IP-Ranges](./ip-ranges.md).

## Sperrseite und Protokoll

Der Serverfilter verwendet intern den reservierten Status 470 für die eigene benannte Sperrlocation; die Antwort an den Besucher ist HTTP **403** mit `Cache-Control: no-store, no-cache, must-revalidate`. Andere Upstream-418-Antworten behalten auch bei aktivem `proxy_intercept_errors` ihren bestehenden Ablauf und Antwortinhalt. Die interne Sperrseite zeigt eine responsive Erklärung mit Besucher-IP, Host, Vorgangskennung, zutreffender Regel beziehungsweise Listenquelle, `public_message` und optionalem Kontaktlink. Bei einem mit `de` beginnenden `Accept-Language` wird Deutsch verwendet, sonst Englisch. `Accept: application/json` ohne gleichzeitiges `text/html` erhält eine JSON-Antwort mit `error: "ip_blocked"` und denselben öffentlichen Details. `X-Request-ID` enthält die Vorgangskennung.

Eingetragene Texte und Links werden vor der HTML-Ausgabe escaped beziehungsweise validiert. Die Seite lädt keine externen Assets; eine Content-Security-Policy verhindert Scripts und Einbettung. `internal_note` und administrative Beschreibungen werden nicht ausgegeben. Geo-Regeln und Seitenvorlage sind in der generierten Konfiguration eingebettet; bei einem einzelnen Request findet kein Listen-Download und kein Datenbankzugriff statt.

Treffer werden je Proxy-Host als JSON-Zeilen unter `/data/logs/ip_firewall_<id>.log` protokolliert. Das mit `escape=json` definierte Log enthält `time`, `host_id`, `host`, `ip`, `request_id`, `rule_id`, `reason`, `source` und `status`. `rule_id` ist eine Referenz im kompilierten Regelwerk, nicht die Datenbank-ID einer Liste. Diese Datei ist von den normalen Zugriffslogs getrennt. Eine eigene Firewall-Statistik- oder Analyseoberfläche gehört nicht zu dieser Umsetzung.

`rootfs/etc/logrotate` erfasst auch `/data/logs/ip_firewall_*.log` mit `daily`, `missingok`, `notifempty` und `copytruncate`. Rotation ist an `LOGROTATE=true` gebunden und standardmäßig deaktiviert; `LOGROTATIONS` bestimmt die Aufbewahrung (Standard 3 Dateien). Die Startskripte übernehmen die bestehende Logrotate-Integration; ein abweichendes natives Deployment muss die Konfiguration ebenfalls verwenden.

## Abhängigkeiten und Grenzen

- `ipaddr.js` normalisiert Adressen und Netze.
- Objection/Knex speichern Listen und Host-Metadaten.
- Die Nginx-Konfigurationsengine prüft und aktiviert generierte Dateien.
- Das bestehende Rechtemodell `access_lists` begrenzt Listenverwaltung und Sichtbarkeit.
- Ausgehender HTTPS-Zugriff ist nur für URL-Abonnements erforderlich.
- Der Nginx-HTTP-`geo`-Support und die für die Sperrseite verwendeten Runtime-Funktionen müssen im eingesetzten Binary vorhanden sein. Kompilierungsänderungen gehören in `shieldpm-nginx`.

Die Funktion betrifft HTTP/HTTPS-Proxy-Hosts. Sie ist keine TCP-/UDP-Stream-Firewall, filtert keinen TLS-Passthrough und ersetzt keine vollständige WAF. URL-Pfade werden gemeinsam über die Host-Regel geschützt; eine eigene Regelauswahl pro Location ist nicht vorgesehen.

## Offene Fragen und Validierung

- Unklar: Die Kompilierungsflags des tatsächlich eingesetzten Docker-/LXC-Nginx-Binary wurden durch die Dokumentationsprüfung nicht nachgewiesen.

Zugehörige Regressionstests:

- `backend/test/lib/firewall-addresses.spec.js` — Parser und Adressnormalisierung.
- `backend/test/lib/firewall-policy.spec.js` — Typen, Grenzen, Ausnahmen und öffentliche beziehungsweise interne Texte.
- `backend/test/lib/firewall-download.spec.js` — DNS-/Redirect-Prüfung, IP-Pinning und Downloadgrenzen.
- `backend/test/internal/firewall-list.spec.js` — Rechte, Quellen, Auswahl und Rollback.
- `backend/test/internal/firewall-policy.spec.js` — Autorisierung neuer Zuordnungen und Schutz der endgültigen Referenzen unter der Konfigurationssperre.
- `backend/test/internal/firewall-render.spec.js` — echte Liquid-Ausgabe, Priorität und Sperrseite.
- `backend/test/internal/gitops-import-validation.spec.js` und `third-proxy-references.spec.js` — Restore ohne Download, ungültige Cache-/Hostdaten sowie Autorisierung und Referenzen vor Datenbankänderungen.
- `frontend/src/api/backend/firewallLists.test.ts`, `frontend/src/modals/FirewallListModal.test.tsx` und `ProxyHostFirewallSettings.test.tsx` — API-Payloads, TXT-Dialog und Host-Einstellungen.

Die Backend-Suiten, die neuen Frontend-Featuretests und der Frontend-Build wurden erfolgreich ausgeführt. `scripts/ci/ip-firewall-smoke.mjs` prüft die erzeugten Firewall-Partials zusätzlich mit einem isolierten echten Nginx, unter anderem Sperren, Ausnahmen, Real-IP, Custom-/Upload-Routen, Anubis-Eingang, ACME, fremde Statusantworten und Trefferlogs. Der vollständige Modullauf einschließlich ModSecurity wurde mit 24 Prüfungen erfolgreich ausgeführt; zusätzlich wurde der portable Lua-/Geo-Lauf geprüft. Diese Prüfungen ersetzen keinen Starttest einer bestimmten bereits installierten Produktionsinstanz.

## Verwandte Seiten

- [Proxy-Host](./proxy-host.md)
- [Nginx-Engine](./nginx-engine.md)
- [Nginx-Templates](./nginx-templates.md)
- [Access-Lists](./access-lists.md)
- [OAuth2-Proxy](./oauth2-proxy.md)
- [Anubis](./anubis.md)
- [Upload Relay](./upload-relay.md)
- [IP-Ranges](./ip-ranges.md)
- [GitOps](./gitops.md)
- [Feature-Übersicht](../features/README.md)
- [Benutzeranleitung](../../wiki/IP-Firewall.md)
