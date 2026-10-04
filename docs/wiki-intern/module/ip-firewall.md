# IP-Firewall für Proxy-Hosts

## Zweck

Die IP-Firewall sperrt Besucher anhand ihrer IPv4-/IPv6-Adresse, eines CIDR-Netzes, einer autonomen Systemnummer (ASN) oder der bestehenden GeoIP-Länderzuordnung auf HTTP-Ebene. Listen werden zentral gepflegt; jeder Proxy-Host aktiviert die Firewall und wählt seine Listen, ASNs und Länder unabhängig. Eine eigene Sperrseite erklärt den tatsächlichen Regel-, Listen-, ASN- oder Ländertreffer.

Ein Eintrag in einer VPN- oder Rechenzentrumsliste ist kein Nachweis eines Angriffs. Die Firewall setzt die vom Betreiber gewählte Zugriffsregel um; sie ergänzt Access-Lists und WAF-Integrationen.

## Kontext

Die Einstellungen liegen in `proxy_host.meta.ip_firewall`. Bestehende Hosts ohne diese Metadaten bleiben unverändert; die Standardvorgabe ist `enabled: false`. Die Oberfläche verwendet durch die API-Konvertierung die entsprechende CamelCase-Struktur `meta.ipFirewall`.

Listen verwenden die vorhandene Berechtigung `access_lists` und deren Eigentümersichtbarkeit. Proxy-Host-Berechtigungen bestimmen weiterhin, welcher Host bearbeitet werden darf. Neu zugewiesene Listen werden vor dem Speichern autorisiert. Eine Konfigurationsvorschau prüft dagegen die Leserechte für alle Listen aus gespeichertem Host und Entwurf, auch bei deaktivierter Firewall oder im Entwurf entfernten Zuordnungen. Der endgültige Host-Schreibvorgang prüft auch bestehende Referenzen unter derselben Nginx-Konfigurationssperre wie das Löschen von Listen; eine gleichzeitige Löschung kann keine verwaiste Zuordnung erzeugen. Diese Prüfung gilt auch bei deaktivierter Firewall und beim GitOps-Import.

## Wichtige Dateien

- `backend/migrations/20261003000000_add_firewall_lists.js` — Tabelle `firewall_list`.
- `backend/models/firewall_list.js` — Objection-Modell, Zeitstempel und Boolean-Konvertierung.
- `backend/lib/firewall-addresses.js` — TXT-Parser und IP-/CIDR-Normalisierung.
- `backend/lib/firewall-download.js` — begrenzter, SSRF-geschützter HTTPS-Abruf.
- `backend/lib/express/json-body.js` — begrenzte JSON-Parser für Listenimporte und Proxy-Host-Regeln.
- `backend/lib/firewall-list-validation.js` — gemeinsame Validierung für API und Backup-Import ohne Download.
- `backend/lib/firewall-policy.js` — Prüfung der Host-Regeln.
- `backend/lib/firewall-geoip.js` — Readiness der vorhandenen HTTP-GeoIP2-Konfiguration und ihrer MMDB-Datei.
- `backend/lib/firewall-geoip-config.js` — stromendes Lesen der Nginx-Konfiguration mit kontexttreuen Includes, Globs und Größenlimits.
- `backend/schema/components/firewall-country-code.json` — gemeinsame ISO-Alpha-2-Ländercodes einschließlich `XK`.
- `backend/internal/firewall-policy.js` — Autorisierung zugewiesener Listen.
- `backend/internal/firewall-list.js` — Listenverwaltung und Aktualisierungen.
- `backend/routes/nginx/firewall_lists.js` — authentifizierte API.
- `backend/internal/nginx.js`, `backend/templates/proxy_host.conf` — Einbindung in die Host-Konfiguration.
- `backend/lib/firewall-render.js` — kompiliert die Host-Regeln und einmal je Quelle gespeicherte Begründungen.
- `backend/lib/firewall-preview.js` — begrenzte CIDR-Zusammenfassungen für Entwurf und aktive Host-Konfiguration.
- `backend/templates/_ip_firewall_geo.conf`, `_ip_firewall.conf`, `ip-blocked.html` — Geo-Auswertung, verpflichtender Filter und Sperrseite.
- `frontend/src/api/backend/firewallLists.ts`, `frontend/src/hooks/useFirewallLists.ts` — API und React-Query-Hooks.
- `frontend/src/pages/Firewall.tsx`, `frontend/src/modals/FirewallListModal.tsx` — Listenübersicht unter `/firewall`, TXT-Vorschau und X4BNet-URL-Vorgaben.
- `frontend/src/modals/ProxyHostFirewallSettings.tsx`, `ProxyHostSecurityTab.tsx` — Einstellungen im Sicherheitstab.
- `frontend/src/modals/ProxyHostFirewallCountrySettings.tsx`, `frontend/src/lib/firewallCountries.ts` — suchbare Länderauswahl und lokalisierte Namen.
- `frontend/src/modals/ProxyHostFirewallAsnSettings.tsx`, `frontend/src/lib/firewallAsn.ts` — ASN-Entwürfe, Nummernprüfung und unabhängiger Status.
- `frontend/src/api/backend/firewallGeoip.ts`, `frontend/src/hooks/useFirewallGeoip.ts` — GeoIP-Status für die Host-Oberfläche.
- `rootfs/usr/local/bin/runtime-config.sh` — gemeinsame Startkonfiguration und optionaler verwalteter ASN-GeoIP2-Block.
- `rootfs/usr/local/bin/update-geoip.py` — gemeinsame GeoIP-Bereitstellung vor Umgebungsvalidierung und allen Diensten.
- `scripts/ci/fixtures/` — kleine offizielle Country-, City- und ASN-Testdatenbanken mit gemeinsamer MIT-Lizenz und Herkunftsnachweisen.
- `scripts/third-party-notices-extra.txt` — statische X4BNet-/MaxMind-Attribution für den NPM-Notice-Generator.

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

| Backend-Feld            | Standard | Bedeutung                                                                             |
| ----------------------- | -------- | ------------------------------------------------------------------------------------- |
| `enabled`               | `false`  | Aktiviert die Firewall nur für diesen Host.                                           |
| `list_ids`              | `[]`     | IDs der ausgewählten zentralen Listen, maximal 32.                                    |
| `allowlist`             | `[]`     | IP-/CIDR-Ausnahmen, maximal 1000.                                                     |
| `denylist`              | `[]`     | Maximal 1000 Regeln mit `address` und öffentlichem `reason`.                          |
| `asn_denylist`          | `[]`     | Maximal 1000 Regeln mit numerischem `asn` und optionalem öffentlichem `reason`.       |
| `country_denylist`      | `[]`     | Maximal 250 ISO-Alpha-2-Codes beziehungsweise `XK`; leer aktiviert keine Länderregel. |
| `country_reason`        | `""`     | Optionale öffentliche Begründung einer Länderregel, maximal 1000 Zeichen.             |
| `block_unknown_country` | `false`  | Sperrt zusätzlich unbekannte beziehungsweise nicht unterstützte Länderzuordnungen.    |
| `public_message`        | `""`     | Zusätzlicher öffentlicher Erklärungstext, maximal 2000 Zeichen.                       |
| `support_url`           | `""`     | Optionaler HTTP(S)-Kontaktlink ohne eingebettete Zugangsdaten.                        |
| `internal_note`         | `""`     | Verwaltungsnotiz, maximal 2000 Zeichen; wird nicht öffentlich ausgegeben.             |

Der Normalisierungshelfer dedupliziert `list_ids` und `allowlist`; das JSON-Schema fordert eindeutige `list_ids`. Doppelte manuelle Sperradressen sind ein Validierungsfehler. Ein manuelles `reason` darf höchstens 1000 Zeichen enthalten. Unbekannte Felder, ungültige Adressen, ungültige Typen und Nullbytes in Textfeldern werden zurückgewiesen.

Ein `asn` ist eine ganze Zahl von 1 bis 4294967295. Die API verwendet die bestehende AJV-Zahlencoercion; reine Policy-/GitOps-Normalisierung verlangt tatsächliche Zahlen und weist Strings zurück. `AS`-Präfixe gehören nicht zum Backend-Datenfeld. Doppelte ASNs werden auch bei unterschiedlicher Begründung zurückgewiesen. Der optionale öffentliche Grund einer ASN-Regel darf bis zu 1000 Zeichen enthalten. Eine fehlende `asn_denylist` wird zu `[]`, sodass bestehende Hosts keine ASN-Sperren erhalten. Es gibt keinen Schalter zum Sperren unbekannter ASNs.

Ländercodes werden im Normalisierungshelfer getrimmt, großgeschrieben und dedupliziert; das API-Schema verwendet dieselbe feste Liste mit 250 zulässigen Codes. `XX` ist kein auswählbares Land und wird nicht in `country_denylist` akzeptiert. Unbekannte Zuordnungen werden ausschließlich über `block_unknown_country` aktiviert. Es gibt keinen zusätzlichen Schalter `country_enabled`: eine nicht leere Länderauswahl beziehungsweise die Unknown-Option wirkt, sobald die Host-Firewall aktiviert ist.

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

Ein unverändertes Listenformular übernimmt frische Serverdaten; bearbeitete Entwürfe bleiben bei Cache-Updates
und fehlgeschlagenen Hintergrundabfragen erhalten. Geänderte TXT-Einträge benötigen erneut eine aktuelle
Importprüfung. Fehlt die zentrale Listenabfrage beim Host-Editor, bleiben gespeicherte IDs ohne fremde
Listennamen sichtbar und können ausdrücklich entfernt werden; andere Host-Regeln bleiben erhalten.

## API

Alle Pfade beziehen sich auf `/api/nginx/firewall-lists` und verwenden die bestehende Authentifizierung und API-Fehlerbehandlung.

| Methode und Pfad    | Verhalten                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `GET /`             | Sichtbare Listen und Aktualisierungsstatus ohne `entries` auflisten; HTTP 200.                          |
| `GET /geoip`        | Länder- und ASN-Quellen unabhängig prüfen; HTTP 200, Berechtigung `proxy_hosts:list`.                   |
| `POST /`            | Liste erstellen und validieren; vollständige Liste mit HTTP 201.                                        |
| `POST /preview`     | TXT-Inhalt prüfen; keine Datenbank- oder Nginx-Änderung.                                                |
| `GET /:id`          | Autorisierte Liste einschließlich editierbarer Einträge lesen.                                          |
| `PUT /:id`          | Liste ändern und betroffene Hosts neu konfigurieren.                                                    |
| `DELETE /:id`       | Unbenutzte Liste soft-deleten; `true` mit HTTP 200. Verwendete Listen ergeben einen Validierungsfehler. |
| `POST /:id/refresh` | URL-Quelle mit leerer Payload `{}` sofort erneut abrufen. Manuelle Listen sind nicht refreshbar.        |

Die Backend-Payloads verwenden Snake Case. Beispiele für Listenfelder sind `source_type`, `source_url` und `update_interval_hours`; der Frontend-API-Client konvertiert diese zu `sourceType`, `sourceUrl` und `updateIntervalHours`. `entries` wird nur bei einer manuellen Quelle geschrieben; URL-Quellen lesen es ausschließlich aus dem Download. Die Host-Firewall wird über die vorhandene Proxy-Host-API in `meta` gespeichert und benötigt keinen eigenen Host-Endpunkt.

JSON-Request-Bodies im gesamten Proxy-Host-Namensraum sind auf **16 MiB** begrenzt, einschließlich Erstellen,
Ändern und beider Konfigurationsvorschauen. Listen-Endpunkte verwenden **16 MiB** für den JSON-Body; die
separate TXT-Grenze von 8 MiB bleibt bestehen. Die Host-Grenze berücksichtigt bis zu 1000 IP- und 1000 ASN-Regeln mit eigenen Gründen; JSON-Escaping zählt zum Bodyumfang. Andere API-Anfragen
behalten das Express-Standardlimit von **100 KiB**; eine ähnlich benannte URL erhält kein größeres Limit.

## Länderfilter und gemeinsame Analytics-GeoIP-Quelle

Der Länderfilter verwendet die bereits von Nginx-Analytics verwendete globale Variable `$geoip2_country_code` und deren MaxMind-DB-Datei. Er führt keinen eigenen Geodaten-Download und keinen externen Geolocation-API-Aufruf aus. Der gemeinsame Boot-Updater bereitet mit `GEOIP_AUTO_UPDATE=true` standardmäßig Country, City und ASN unter `/data/nginx` vor Umgebungsvalidierung und Dienststart vor; die Modulaktivierung bleibt separat erforderlich. Offline- oder eigene MaxMind-Quellen verwenden `GEOIP_AUTO_UPDATE=false`. Gemeint ist die bestehende **MMDB-GeoIP-Datenbank**, nicht die SQL-Datenbank mit Analytics-Zählern. Die Einrichtung und das Fehlerverhalten stehen in der [Analytics-Anleitung](../../wiki/Analytics.md#enabling-geoip-country-statistics).

Die Readiness-Prüfung liest die aktive Masterkonfiguration `/usr/local/nginx/conf/nginx.conf`, die auch die unterstützten Docker- und nativen Startskripte verwenden, samt verschachtelten und per Glob ausgewählten Includes. Relative Include-Pfade werden wie bei Nginx gegen das Verzeichnis der Masterkonfiguration aufgelöst; die eingebundenen Direktiven behalten ihren ursprünglichen HTTP-, Server- oder Location-Kontext. Es gibt keinen Fallback auf eine möglicherweise veraltete Distributionskonfiguration unter `/etc/nginx/nginx.conf`. Geprüft werden die HTTP-GeoIP2-Ländervariable mit `country iso_code`, dieselbe vertrauenswürdig korrigierte Besucher-IP `source=$remote_addr` sowie eine vorhandene, nicht leere referenzierte MMDB-Datei. Eine unabhängige Headerquelle oder eine Konfiguration, die unbekannte IPs einem tatsächlichen Land zuordnet, ist keine gültige Grundlage. Der Status gibt keine lokalen Dateipfade oder Konfigurationstexte zurück.

Es muss genau eine Definition dieser Ländervariable im HTTP-GeoIP2-Kontext geben, auch über Dateigrenzen hinweg. Wiederholte Includes zählen mehrfach. Weitere deklarierte Schreiber derselben Variable, etwa `map`, `geo`, `split_clients`, `set`, `auth_request_set` oder `set_by_lua*`, werden auch in Server-/Location-Includes zurückgewiesen. Erkannte benannte Regex-Captures zählen ebenfalls als Schreiber; dies gilt auch für Regex-Schlüssel aus eingebundenen Map-Dateien. Variablennamen werden dabei ohne Beachtung der Groß-/Kleinschreibung verglichen. Scheinbare Direktiven in Kommentaren, Strings oder einem Stream-Kontext erfüllen die Readiness-Voraussetzung nicht. Die Prüfung untersucht Konfigurationsdirektiven und die dort verwendeten Regex-Captures; beliebige benutzerdefinierte Lua-Programme werden nicht semantisch analysiert.

Nach dem Schreiben der gestagten Dateien prüft `internalNginx.test()` in `backend/internal/nginx.js` nach erfolgreichem `nginx -tq` und vor dem Reload über `assertConfiguredFirewallLookups()` die vollständige Masterkonfiguration samt Includes; erforderliche Länder-/ASN-Quellen ergeben sich aus den tatsächlichen verwalteten Firewall-Maps. Eine erkannte Quellkollision, auch aus der Advanced-Konfiguration eines anderen Hosts, verhindert die Einzel- beziehungsweise Bulk-Aktivierung und durchläuft die bestehenden Rollbackpfade.

Der referenzierte MMDB-Pfad muss absolut sein und auf eine reguläre, nicht leere Datei zeigen. Ein relativer MMDB-Pfad liefert `database_missing`; er wird nicht gegen das Arbeitsverzeichnis des Backends oder einen angenommenen Nginx-Laufzeitprefix aufgelöst. Die Readiness-Prüfung untersucht die effektive Konfigurationsstruktur und Dateivoraussetzungen, nicht den MMDB-Inhalt, seine Schemakompatibilität oder vollständige Integrität. Für die Länderquelle werden Country- oder City-Daten benötigt; eine ASN-Datenbank enthält keine `country iso_code`-Zuordnung. Fehlende Länderwerte bleiben `XX` und werden nur durch `block_unknown_country` gesperrt. Vor Aktivierung wird zusätzlich die tatsächliche Konfiguration durch Nginx geprüft.

Fehlende ausdrücklich benannte Include-Dateien, Include-Zyklen, ungültige Strukturen oder überschrittene Inspektionsgrenzen liefern `configuration_unavailable`. Ein Glob ohne Treffer bleibt zulässig. Include-Globs unterstützen `*`, `?` und `[]` samt POSIX-Zeichenklassen für C/ASCII; führende Punkte müssen ausdrücklich passen. `**` ist kein rekursiver Glob, und Shell-Brace-/Extglob-Ausdrücke werden nicht erweitert. Die Verarbeitung ist auf 512 MiB pro Datei, 8192 gelesene Dateien einschließlich Wiederholungen, 32 Include-Ebenen, 100000 gelesene Glob-Verzeichniseinträge, 1 MiB pro Token, 2 MiB pro Direktive und 32 MiB relevante Direktiventexte begrenzt. Große Geo-/Map-Tabellen werden stromend gelesen; gewöhnliche CIDR-Zeilen werden nicht als relevante Direktiventexte gesammelt. Map-Includes und Regex-Schlüssel bleiben für die Schreiberprüfung sichtbar. Dadurch bleiben auch generierte Listen mit 200000 Einträgen prüfbar.

`GET /api/nginx/firewall-lists/geoip` liefert weiterhin `available`, `module_enabled`, `database_present` und `reason` für die Länderquelle. Bei Erfolg ist `reason: null`; Fehlergründe sind `module_disabled`, `database_missing`, `country_variable_missing` oder `configuration_unavailable`. Zusätzlich liefert das Backend stets `asn` mit denselben vier Feldern; dort ersetzt `asn_variable_missing` den länderspezifischen Grund. Beide Fähigkeiten sind unabhängig: eine fehlende ASN-Datei deaktiviert keinen Länderfilter, eine fehlende Länderquelle verhindert keine ASN-Regeln. Das Antwortschema erlaubt ältere Antworten ohne `asn`; eine fehlende ASN-Fähigkeit ist kein positiver Bereitschaftsnachweis. Der Frontend-Client konvertiert verschachtelte Felder zu CamelCase.

Die Host-Oberfläche bietet eine suchbare Mehrfachauswahl mit lokalisierten Ländernamen und Codes, eine optionale öffentliche Länderbegründung und den separaten Schalter für unbekannte Länder. Während Laden, Fehler oder fehlender GeoIP-Voraussetzungen sind neue Länder beziehungsweise die Unknown-Aktivierung gesperrt; der Status kann erneut geprüft werden. Gespeicherte Regeln bleiben erhalten und können entfernt werden, auch bei ausgeschalteter Firewall. Solange solche Regeln bestehen, kann die Firewall ohne verfügbare GeoIP-Quelle nicht wieder aktiviert werden. Das Backend prüft diese Voraussetzung ebenfalls vor Speicherung, Vorschau und Nginx-Generierung. Das Aktivieren eines deaktivierten Proxy-Hosts mit eingeschalteten Länder-/Unknown-Regeln prüft die Readiness vor dem Datenbank-Schreibvorgang; eine fehlende Quelle lässt den Host deaktiviert.

Nginx normalisiert den GeoIP-Wert gegen dieselben 250 bekannten Codes; leere und andere unbekannte Werte werden zu `XX`. Nur die ausdrücklich aktivierte Unknown-Option sperrt solche Ergebnisse. Reine IP-/Listen-Regeln benötigen keine GeoIP-Lookups; der standardmäßige Boot-Download läuft trotzdem, sofern er nicht ausdrücklich deaktiviert ist. Optionale Informationen werden nur bei verfügbarer Quelle eingebunden; fehlende globale Variablen werden beim Lesen dieser Informationen abgefangen. Die IP-Allowlist übersteuert auch Länder- und Unknown-Sperren.

Die Zuordnung hängt von der vorhandenen GeoIP-Datenbank ab und beschreibt die IP-Adresse; sie ist kein Nachweis des tatsächlichen Aufenthaltsorts oder eines Angriffs. Es entsteht keine neue Firewall-Analytics-Oberfläche. Die Datenquelle wird geteilt, die Firewall-Trefferlogs bleiben separat.

### ASN-Quelle und Host-Regeln

ASN-Regeln verwenden die reservierten globalen Variablen `$spm_geoip2_asn` und `$spm_geoip2_asn_org`. Die Readiness-Prüfung verlangt je genau eine Definition im selben wirksamen HTTP-`geoip2`-Block mit `source=$remote_addr` und den Lookups `autonomous_system_number` beziehungsweise `autonomous_system_organization`. Für die Nummer sind nur fehlende, leere oder `0`-Defaults zulässig, für die Organisation nur fehlende oder leere Defaults. Weitere erkannte Schreiber dieser Variablen werden wie bei der Länderquelle zurückgewiesen; Includes, Dateivoraussetzungen und Inspektionsgrenzen gelten ebenfalls. Eine echte ASN-MMDB ist erforderlich; die strukturelle Prüfung verifiziert auch hier weder Inhalt noch Schemakompatibilität.

Die gemeinsamen Startskripte erzeugen nach der Datenbankvorbereitung einen markierten ASN-Block nur mit `NGINX_LOAD_GEOIP2_MODULE=true` und einer regulären, nicht leeren Datei `/data/nginx/GeoLite2-ASN.mmdb` ohne Symlink. `configure_nginx_modules()` ersetzt ausschließlich diesen verwalteten Block idempotent und lässt eigene Variablen des Betreibers erhalten. Der Block nutzt `auto_reload 5m`. Bei manuell nachgereichten Datenbanken ist ein Neustart nötig, damit ihre Variablen eingerichtet werden. Ohne passende Datei oder aktiviertes Modul wird kein ASN-Block angelegt.

Die vorhandenen Country-/City-Masterblöcke behalten ihre bisherige Modulsteuerung und benötigen weiterhin die von ihnen referenzierten Dateien, wenn sie aktiv sind. Unabhängige ASN-Readiness ist deshalb keine Zusage eines unveränderten Standardstarts mit ausschließlich einer ASN-Datei; die gesamte Nginx-Konfiguration muss ihren Test bestehen.

Eine aktivierte Host-Firewall mit ASN-Regeln benötigt eine verfügbare ASN-Quelle vor Speicherung, Vorschau, Nginx-Generierung und Reaktivierung eines deaktivierten Hosts. Länderregeln behalten ihre eigene Prüfung; kombinierte Regeln teilen einen Statusabruf. Fehlende ASN-Informationen allein verhindern keine reinen IP- oder Länderregeln. Nicht zuordenbare ASNs treffen keine ASN-Sperre; eine bestehende Länder-Unknown-Regel kann unabhängig davon greifen.

Die Host-Oberfläche akzeptiert `13335`, `AS13335` und `as13335` und überträgt numerische Werte. Laden, Fehler oder fehlende ASN-Unterstützung sperren neue Nummern und eine Reaktivierung mit gespeicherten ASN-Regeln; Gründe und Entfernen bleiben editierbar. Die Statusprüfung kann erneut gestartet werden. Ungültiger Rohtext bleibt beim Tabwechsel im nicht übertragenen Formik-Status erhalten und verhindert zusammen mit doppelten Regeln sowohl Speichern als auch die Konfigurationsvorschau. Die Sperrseitenvorschau verwendet fiktive, als Beispiel bezeichnete Betreiberinformationen und gibt keine interne Notiz aus.

## URL-Abonnements

Nur HTTPS-Quellen sind als Listenabonnement zulässig. Die URL darf höchstens 2048 Zeichen lang sein und weder Zugangsdaten noch Fragment enthalten. Alle DNS-Antworten eines Ziels müssen öffentlich routbare Adressen sein; der HTTPS-Verbindungsaufbau wird auf diese geprüften Adressen festgelegt. Private, reservierte, Loopback-, Link-Local-, Multicast- und Metadatenziele sind ausgeschlossen, auch bei IPv4-in-IPv6-Adressen. Bis zu drei Redirects werden jeweils erneut geprüft.

Der Abruf verwendet direktes natives HTTPS mit Zertifikatsprüfung und ohne Umgebungs-Proxies. Ein gemeinsames **15-Sekunden-Limit** umfasst DNS, Redirects und Antwortdaten. Nur HTTP 200, unkomprimierter vollständiger Inhalt und gültiges UTF-8 werden akzeptiert; die Rohantwort darf höchstens 8 MiB enthalten.

Das Aktualisierungsintervall beträgt **6 bis 168 Stunden**, standardmäßig 24 Stunden. Der Hintergrunddienst prüft sofort beim Start und danach jede Minute auf fällige aktivierte URL-Listen. Nach einem fehlgeschlagenen Versuch wartet er mindestens 15 Minuten bis zum nächsten automatischen Versuch. Deaktivierte Quellen werden nicht automatisch aktualisiert.

Ein Download wird vollständig eingelesen und geprüft, bevor die vorherige Liste ersetzt wird. HTTP-Fehler, Zeitüberschreitungen, leere Antworten und ungültige Listeneinträge erhalten den bisherigen gültigen Inhalt und `last_updated_on`; `last_error` zeigt die Ursache, sofern die Statusaktualisierung in der Datenbank gelingt. Auch nach einem fehlgeschlagenen manuellen Refresh lädt die Oberfläche den Listen-/Detailstatus erneut. Die Änderung betroffener aktiver Hosts erfolgt unter der Nginx-Konfigurationssperre: Datenbankänderung, gestagte Host-Dateien, `test()` und Reload. Erfolgreiche Aktivierung löscht `last_error`.

Bei Render-, Test- oder Reloadfehlern versucht der Dienst zuerst die Listendaten und anschließend sämtliche
gestagten Host-Dateien wiederherzustellen und erneut zu laden. Ein Datenbankfehler verhindert weder weitere
Host-Rollbacks noch den Restore-Reload. Nur bei fehlerfreier Wiederherstellung meldet die API
`previous list retained`; andernfalls nennt `recovery incomplete` die betroffenen Kategorien
`list data`, `host configuration/status` beziehungsweise `Nginx reload`. Technische Rollbackfehler werden
einzeln privat protokolliert. Eine ebenfalls fehlgeschlagene `last_error`-Speicherung verdeckt nicht die
ursprüngliche Recovery-Fehlermeldung.

### X4BNet-Vorgaben

| Vorgabe               | Inhalt                                       | Rohdatei                                                                             |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| VPN                   | Vom Anbieter als VPN eingeordnete Netze      | `https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt`        |
| VPN und Rechenzentren | Breitere Liste einschließlich Hosting-Netzen | `https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/datacenter/ipv4.txt` |

Die beiden Vorgaben bleiben getrennt auswählbar. ShieldPM liefert keine Kopie der Listen mit; die Oberfläche schlägt ihre HTTPS-URLs vor. Die TXT-Dateien enthalten keine individuelle Betreiberbegründung oder verlässliche Zuordnung zu einem bestimmten VPN-Anbieter. Öffentlich erscheinen deshalb die konfigurierte Listenbezeichnung und Begründung, keine erfundenen Anbieterinformationen.

Die Quelle [X4BNet/lists_vpn](https://github.com/X4BNet/lists_vpn) beschreibt Listen und Skripte unter MIT; die Attribution ist in `THIRD-PARTY-NOTICES.md` enthalten.

## GitOps und Wiederherstellung

`backend/internal/gitops.js` exportiert Firewall-Listen unter `config/firewall-lists/` mit Quellmetadaten, normalisiertem Cache und Aktualisierungsstatus. Die Host-Regeln bleiben in den exportierten Proxy-Host-Metadaten enthalten.

Beim Import werden Listen vor Proxy-Hosts verarbeitet. Der gemeinsame Validierungshelfer prüft Metadaten und gecachte IP-/CIDR-Einträge ohne einen Netzwerkabruf; eine Wiederherstellung benötigt deshalb keinen erfolgreichen Feed-Download. Ungültige Einträge verhindern den betreffenden Schreibvorgang. Ein URL-Abonnement muss mindestens einen gültigen gecachten Eintrag enthalten, auch wenn es deaktiviert ist; fehlender, leerer oder nur aus Kommentaren bestehender Cache wird vor dem Listenschreibvorgang zurückgewiesen. Referenzen werden vor dem Host-Schreibvorgang geprüft.

Das Pruning bisheriger Firewall-Listen wird bis nach sämtlichen erfolgreichen Importen sowie der validierten Nginx-Neugenerierung und dem Reload verschoben. Schlägt ein Import oder die Nginx-Aktivierung fehl, wird keine bisherige Liste durch dieses Pruning entfernt. Erst nach erfolgreicher Übernahme des gesamten Imports werden nicht mehr vorhandene Listen gelöscht; noch verwendete Listen bleiben auch dann geschützt. So stehen bisherige Zuordnungen bis zum Abschluss des Host-Restores weiter zur Verfügung.

GitOps aktiviert dafür `bulkGenerateConfigGroups(groups, {throwOnError: true})`. Ein Render- oder Syntaxfehler wird nach dem Zurückrollen der gestagten Dateien weitergegeben und erreicht weder den abschließenden Reload noch die Listenbereinigung. Andere Aufrufer behalten den bisherigen Rückgabestatus des Sammellaufs. Der Gesamtimport ist weiterhin keine Datenbanktransaktion: vor einem späteren Fehler erfolgreich importierte Objekte werden nicht gemeinsam zurückgerollt.

Fehlt das Verzeichnis `firewall-lists` in einer älteren Sicherung, gilt das nicht als Löschauftrag: bestehende Listen bleiben erhalten. Der reguläre Abonnement-Timer kann aktivierte URL-Quellen nach der Wiederherstellung wieder aktualisieren.

## Nginx-Verhalten und Priorität

Die Listen werden mit Nginx-`geo` ausgewertet. Ein verpflichtender Filter auf Serverebene schützt den HTTP-Eingang des Hosts; die Entscheidung ist unabhängig von Basic Auth, OAuth2/OIDC und `satisfy any`.

1. Eine passende `allowlist`-Ausnahme hebt ausschließlich diese IP-Firewall-Sperre auf.
2. Ein manueller Sperrtreffer hat Vorrang vor einem zentralen Listentreffer.
3. Danach werden die aktivierten, ausgewählten Listen geprüft.
4. Ohne IP-/Listentreffer werden die ausgewählten ASNs geprüft.
5. Danach werden die ausgewählten Länder und optional unbekannte Länder geprüft.
6. Ohne Sperrtreffer gelten die übrigen Host-Sicherheitsregeln unverändert.

Innerhalb der manuellen Regeln beziehungsweise der Listennetze wählt `geo` das längste passende CIDR-Präfix. Gleiche Netze aus mehreren Listen verwenden die erste zugeordnete Liste in `list_ids`. Eine breitere manuelle Sperre hat trotzdem Vorrang vor einem spezifischeren Listentreffer.

Ausnahmen umgehen weder Access-Lists noch SSO, mTLS, CrowdSec oder eine WAF. Die Firewall-Sperrseite wird nur für einen Firewall-Treffer ausgewählt; fremde 403-Antworten behalten ihren bestehenden Ablauf, insbesondere OAuth2-Loginweiterleitungen.

Die Prüfung erfasst Custom Locations, Upload-Relay-Routen und den ersten WebSocket-Handshake. Bei Anubis erfolgt sie am öffentlichen Eingang, nicht erst hinter dem PoW-Gate. Die ACME-Ausnahme gilt ausschließlich für die URI `/.well-known/acme-challenge/<token>` mit `[A-Za-z0-9_-]+` als Token, nicht für beliebige Unterpfade. Bereits bestehende WebSocket- oder Streaming-Verbindungen werden durch eine neue Regel nicht nachträglich beendet.

Die auswertbare Adresse ist die von Nginx bestimmte Besucher-IP. Hinter Cloudflare oder einem vorgeschalteten Proxy ist eine korrekt begrenzte Real-IP-Vertrauenskonfiguration erforderlich. Beliebige vom Besucher gesetzte Forwarded-Header dürfen nicht als vertrauenswürdige IP-Quelle dienen; siehe [IP-Ranges](./ip-ranges.md).

## Konfigurationsvorschau

Die [Proxy-Host-Konfigurationsvorschau](./proxy-host.md#konfigurationsvorschau-vor-dem-speichern) zeigt die automatisch generierten IP-Tabellen für Ausnahmen, manuelle Regeln und Listen als Anzahl kompilierter Einträge und SHA-256-Prüfsumme. Einzelne CIDRs werden in Entwurf und aktivem Vergleich ausgelassen. Die Prüfsumme umfasst die geordnete Folge `address value;` einschließlich der numerischen Regelreferenz; Einrückung und CRLF ändern sie nicht. Freie Konfigurationstexte sowie die übrigen Firewall-Direktiven bleiben Teil der Vorschau. Bei einer Zusammenfassung enthält die Antwort die Einschränkung `firewall-rule-summaries`; die Oberfläche erklärt sie.

Der Entwurf wird mit leeren CIDR-Tabellen und separat berechneten Zusammenfassungen gerendert. Die aktive Datei wird in 64-KiB-Blöcken gelesen, ohne Symlinks zu folgen; der Rohdatenumfang ist auf 512 MiB und die kompakte Ausgabe auf 2 MiB begrenzt. Unbekannte Syntax innerhalb einer geschützten generierten Tabelle wird abgewiesen, statt deren Inhalt auszugeben. Die produktive Nginx-Generierung behält alle Regeln; die Vorschau schreibt nichts und führt keinen Nginx-Test aus.

## Sperrseite und Protokoll

Der Serverfilter verwendet intern den reservierten Status 470 für die eigene benannte Sperrlocation; die Antwort an den Besucher ist HTTP **403** mit `Cache-Control: no-store, no-cache, must-revalidate`. Andere Upstream-418-Antworten behalten auch bei aktivem `proxy_intercept_errors` ihren bestehenden Ablauf und Antwortinhalt. Die interne Sperrseite zeigt eine responsive Erklärung mit Besucher-IP, Host, Vorgangskennung, zutreffender Regel beziehungsweise Listenquelle, `public_message` und optionalem Kontaktlink. Bei einem mit `de` beginnenden `Accept-Language` wird Deutsch verwendet, sonst Englisch. `Accept: application/json` ohne gleichzeitiges `text/html` erhält eine JSON-Antwort mit `error: "ip_blocked"` und denselben öffentlichen Details. `X-Request-ID` enthält die Vorgangskennung.

Eingetragene Texte und Links werden vor der HTML-Ausgabe escaped beziehungsweise validiert. Die Seite lädt keine externen Assets; eine Content-Security-Policy verhindert Scripts und Einbettung. `internal_note` und administrative Beschreibungen werden nicht ausgegeben. Geo-Regeln und Seitenvorlage sind in der generierten Konfiguration eingebettet; bei einem einzelnen Request findet kein Listen-Download und kein SQL-Datenbankzugriff statt. Länder- und ASN-Werte verwenden die Nginx-GeoIP2-Lookups derselben vertrauenswürdig korrigierten Besucher-IP.

Bei verfügbaren Quellen zeigen Sperrseite und JSON das Land sowie ASN und Netzwerkorganisation, unabhängig davon, ob eine IP-, Listen-, ASN- oder Länderregel sperrt. Länderwerte werden als ISO-Code beziehungsweise `XX` ausgegeben; HTML zeigt ASNs mit `AS`-Präfix, JSON verwendet `asn` als Zahl und `asn_organization` als Text. Fehlende Nummern oder leere Organisationen erscheinen nicht als JSON-Felder. Diese Informationen aktivieren keine Sperrregel. Die ASN-Regel verwendet ohne eigenen Grund eine lokalisierte Standardbegründung und die Quellenbezeichnung `ASN-Regel` beziehungsweise `ASN rule`; Länderregeln behalten `GeoIP-Länderregel` beziehungsweise `GeoIP country rule`.

Treffer werden je Proxy-Host als JSON-Zeilen unter `/data/logs/ip_firewall_<id>.log` protokolliert. Das mit `escape=json` definierte Log enthält `time`, `host_id`, `host`, `ip`, `request_id`, `rule_id`, `reason`, `source` und `status`. Beim Rendern verfügbare Informationsquellen ergänzen `country_code`, `asn` und `asn_organization`. Im Log ist `asn` ein numerischer String beziehungsweise leer bei fehlender Zuordnung. `rule_id` ist eine Referenz im kompilierten Regelwerk, nicht die Datenbank-ID einer Liste. Diese Datei ist von den normalen Zugriffslogs getrennt. Eine eigene Firewall-Statistik- oder Analyseoberfläche gehört nicht zu dieser Umsetzung.

`start.sh` erhält `/data/logs` bei Neustarts. Vor der Nginx-Validierung erstellt `prepare_nginx_log_directory()` das Verzeichnis bei Bedarf, setzt seinen Eigentümer auf `PUID:PGID` und den Modus auf `0700`; ein Symlink an diesem Pfad wird abgewiesen. Der anschließende bestehende Eigentümerwechsel unter `/data` übernimmt auch erhaltene Logdateien für die gewählte Laufzeit-UID. Das gilt für Docker und native Installationen mit denselben Startskripten.

`rootfs/etc/logrotate` erfasst auch `/data/logs/ip_firewall_*.log` mit `daily`, `missingok`, `notifempty` und `copytruncate`. Rotation ist an `LOGROTATE=true` gebunden und standardmäßig deaktiviert; `LOGROTATIONS` bestimmt die Aufbewahrung (Standard 3 Dateien). Die Startskripte übernehmen die bestehende Logrotate-Integration; ein abweichendes natives Deployment muss die Konfiguration ebenfalls verwenden.

## Abhängigkeiten und Grenzen

- `ipaddr.js` normalisiert Adressen und Netze.
- Objection/Knex speichern Listen und Host-Metadaten.
- Die Nginx-Konfigurationsengine prüft und aktiviert generierte Dateien.
- Das bestehende Rechtemodell `access_lists` begrenzt Listenverwaltung und Sichtbarkeit.
- GeoIP2 und die passende Country-/City- beziehungsweise ASN-MMDB sind für aktive Länder-/Unknown- beziehungsweise ASN-Regeln erforderlich. Optionale Informationen benötigen keine zusätzlichen Blockregeln.
- Ausgehender HTTPS-Zugriff ist nur für URL-Abonnements erforderlich.
- Der Nginx-HTTP-`geo`-Support und die für die Sperrseite verwendeten Runtime-Funktionen müssen im eingesetzten Binary vorhanden sein. Kompilierungsänderungen gehören in `shieldpm-nginx`.

Die Funktion betrifft HTTP/HTTPS-Proxy-Hosts. Sie ist keine TCP-/UDP-Stream-Firewall, filtert keinen TLS-Passthrough und ersetzt keine vollständige WAF. URL-Pfade werden gemeinsam über die Host-Regel geschützt; eine eigene Regelauswahl pro Location ist nicht vorgesehen.

## Offene Fragen und Validierung

- Ein vollständiger nativer/LXC-Installationslauf und ein Produktionsstart wurden nicht ausgeführt. Die Modulanforderungen der Docker-Images wurden dagegen durch echte CI-Smokes auf AMD64 und ARM64 geprüft.

Zugehörige Regressionstests:

- `backend/test/lib/firewall-addresses.spec.js` — Parser und Adressnormalisierung.
- `backend/test/lib/firewall-policy.spec.js` — Typen, Grenzen, Ausnahmen und öffentliche beziehungsweise interne Texte.
- `backend/test/lib/firewall-geoip.spec.js`, `firewall-geoip-inspection.spec.js` und `firewall-geoip-includes.spec.js` — verfügbare HTTP-Länderquelle, sichere Besucher-IP, Includes/Globs, überschreibende Variablen-Direktiven, große CIDR-Tabellen und private Statusantworten.
- `backend/test/lib/firewall-asn-geoip.spec.js` — unabhängige ASN-Fähigkeit, sichere Nummern-/Organisationsquelle und Konflikte reservierter Variablen.
- `backend/test/lib/firewall-download.spec.js` — DNS-/Redirect-Prüfung, IP-Pinning und Downloadgrenzen.
- `backend/test/lib/express-json-body.spec.js` — tatsächliche HTTP-Middleware, große gültige Host-Regeln und getrennte Größenlimits der API-Namensräume.
- `backend/test/internal/firewall-list.spec.js` — Rechte, Quellen, Auswahl und Rollback.
- `backend/test/internal/firewall-policy.spec.js` — Autorisierung neuer Zuordnungen und Schutz der endgültigen Referenzen unter der Konfigurationssperre.
- `backend/test/lib/firewall-preview.spec.js` und `backend/test/internal/proxy-host-preview.spec.js` — Zusammenfassungen großer Regelwerke, Änderungsprüfsummen und Leserechte für bestehende, entfernte oder deaktivierte Zuordnungen.
- `backend/test/internal/firewall-preview-render.spec.js` — echte große Liquid-Ausgabe und begrenzte Vorschau; Modelle sind isoliert und versehentliche Datenbank-/Konfigurationsimporte schlagen fehl, damit der Test keine JWT-Schlüssel erzeugt.
- `backend/test/internal/firewall-render.spec.js` — echte Liquid-Ausgabe, Priorität und Sperrseite.
- `backend/test/internal/gitops-import-validation.spec.js` und `third-proxy-references.spec.js` — Restore ohne Download, ungültige Cache-/Hostdaten sowie Autorisierung und Referenzen vor Datenbankänderungen.
- `backend/test/internal/nginx-bulk-validation.spec.js` — strenger GitOps-Sammellauf und vorheriger Rückgabestatus nach demselben Dateisystem-Rollback.
- `backend/test/internal/proxy-host-enable-firewall.spec.js` — GeoIP-Readiness vor der Reaktivierung eines Hosts und unveränderter Deaktivierungsstatus bei fehlender Quelle.
- `scripts/tests/test_runtime_config.py` — Loghistorie bei Neustarts, Verzeichnisvorbereitung vor einem echten Nginx-Test, Symlink-Abweisung und idempotente optionale ASN-Konfiguration.
- `frontend/src/api/backend/firewallLists.test.ts`, `frontend/src/hooks/useFirewallLists.test.tsx`, `frontend/src/modals/FirewallListModal.test.tsx` und `ProxyHostFirewallSettings.test.tsx` — API-Payloads, aktualisierte Fehlerzustände, Schutz bearbeiteter TXT-Entwürfe und entfernbare Host-Zuordnungen bei Ladefehlern.
- `frontend/src/lib/firewallCountries.test.ts`, `frontend/src/api/backend/firewallGeoip.test.ts` und `ProxyHostFirewallPreview.test.ts` — erlaubte Ländercodes, Readiness-Antworten und Vorschau der tatsächlichen Länderbegründung.
- `frontend/src/lib/firewallAsn.test.ts`, `ProxyHostFirewallSettings.test.tsx`, `ProxyHostModal.test.tsx` und `ProxyHostModalFormValues.test.ts` — ASN-Eingaben, Duplikate, unabhängiger Status und Erhalt ungültiger Entwürfe über Tabwechsel.

`scripts/ci/ip-firewall-smoke.mjs` prüft die erzeugten Firewall-Partials zusätzlich mit einem isolierten echten Nginx, unter anderem Sperren, Ausnahmen, Real-IP, IPv6-Regeln, Custom-/Upload-Routen, Anubis-Eingang, ACME, fremde Statusantworten, WAF-/Lua-Access-Priorität und Trefferlogs. Vor der ASN-Erweiterung bestanden lokal 56 vollständige Modulprüfungen einschließlich ModSecurity und GeoIP2, 53 Prüfungen ohne ModSecurity und 30 reine IP-Prüfungen ohne GeoIP2. Die Erweiterung prüft zusätzlich ASN-Nummern und Organisationen, die Priorität IP → Liste → ASN → Land, gemeinsame Besucher-IP-Lookups und optionale Informationen ohne aktive ASN-Regeln. Die kleinen offiziellen MaxMind-Testdatenbanken unter `scripts/ci/fixtures/` dienen nur isolierten Tests und ersetzen keine Produktions-GeoIP-Datenbanken.

`scripts/ci/docker-smoke.sh` kopiert die Country-, City- und ASN-Fixtures in den Testcontainer und verwendet sie für den tatsächlichen Start und den vollständigen isolierten Firewall-Testlauf. Mit `NGINX_SMOKE_DISCOVER_MODULES=true` ermittelt `nginx-smoke-modules.mjs` tatsächliche Modulpfade aus `nginx -V`, den `load_module`-Pfaden von `nginx -T` und Standardverzeichnissen. Vorhandene dynamische NDK-, Lua-, ModSecurity- und GeoIP2-Module werden in Abhängigkeitsreihenfolge geladen; statisch eingebaute Module benötigen keine `.so`-Datei. `NGINX_REQUIRE_MODSECURITY=true` hält die Prüfung der tatsächlichen ModSecurity-Direktive verpflichtend, statt einen statischen Build vorauszusetzen. Der lokale echte Nginx-Lauf mit automatischer Modulermittlung war erfolgreich.

Der Docker-Smoke prüft außerdem erhaltene Logs, Verzeichnismodus und Schreibrechte unter UID 0 und anschließend unter UID 1000 mit übernommener UID-0-Loghistorie. Die [Docker-CI für Commit `aa86dff`](https://github.com/shedowe19/ShieldPM/actions/runs/37127826697) war auf AMD64 und ARM64 erfolgreich: je Architektur liefen zweimal die 56 vollständigen Modulprüfungen mit neun protokollierten Sperren unter diesen UIDs. Dieser Nachweis stammt aus dem Stand vor der ASN-Erweiterung. Er prüft die tatsächlichen Image-Module und Startskripte, verwendet aber eine isolierte GeoIP-Testkonfiguration mit der synthetischen Fixture. Dieser Docker-/Image-Lauf und ein Produktionsstart wurden lokal nicht ausgeführt. Die isolierte lokale Logverzeichnis-Regression mit echtem `nginx -tq` war erfolgreich; der lokale UID-1000-Eigentümerwechsel wurde wegen fehlender Laufzeitunterstützung ausdrücklich übersprungen.

Zusätzlich wurden die unveränderten `GeoLite2-Country.mmdb`- und `GeoLite2-City.mmdb`-Dateien aus dem [Release `2026.10.03`](https://github.com/shedowe19/GeoLite.mmdb/releases/tag/2026.10.03) nach Abgleich der veröffentlichten SHA-256-Prüfsummen lokal mit echtem Nginx geprüft. Beide bestanden den unveränderten 56-Prüfungen-Lauf und jeweils 59 Zusatzprüfungen. Eine unabhängige C-Abfrage über `libmaxminddb` 1.9.1 verglich jeweils 19 IPv4-/IPv6-Lookups mit Nginx. Geprüft wurden unter anderem GB-Sperren, erlaubte DE-/US-Adressen, Regelpriorität, Ausnahmen, Unknown-Verhalten, Host-Isolation sowie HTML-, JSON- und Logausgaben. Die Testdatenbank-Metadaten der beiden Dateien nennen `build_epoch: 1790952592` und `ip_version: 6`. Die großen Release-Datenbanken sind keine mitgelieferten Test-Fixtures.

Bei der damaligen Prüfung wurde die echte ASN-Datei aus demselben Release ausdrücklich als Länderquelle verwendet. Sie bestand 57 getrennte Verhaltensprüfungen und bestätigte diese Abgrenzung: Nginx liefert mangels Länderfeld `XX`, während die strukturelle Readiness-Prüfung die vorhandene Datei akzeptiert. Ein zusätzlicher Nicht-MMDB-Test mit einer nicht leeren JSON-Datei bestätigte dieselbe Readiness-Grenze, scheiterte aber wie erwartet an `nginx -t`. Diese Negativfälle betreffen den Länder-Lookup und sind kein Nachweis einer unterstützten ASN-Länderquelle oder vollständigen MMDB-Validierung.

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
- [Analytics](./analytics.md)
- [Feature-Übersicht](../features/README.md)
- [Benutzeranleitung](../../wiki/IP-Firewall.md)
