# Access-Lists

## Zweck

Zugriffskontrolle für Proxy-Hosts via Basic Auth, IP-Ranges und mTLS.

## Kontext

Access-Lists können an Proxy-Hosts gebunden werden, um den Zugriff einzuschränken.

## Wichtige Dateien

- `backend/internal/access-list.js` (17 KB) — Business-Logik
- `backend/internal/ip_ranges.js` (3 KB) — Cloudflare IP-Ranges
- `backend/models/access_list.js` (3 KB) — Objection.js-Modell
- `backend/models/access_list_auth.js` (1 KB) — Basic-Auth-Modell
- `backend/models/access_list_client.js` (1 KB) — IP-Client-Modell
- `backend/routes/nginx/access_lists.js` (3 KB) — API-Routen
- `backend/lib/service-credentials.js` — öffentliche SSO-Metadaten und Erhaltung hinterlegter Secrets
- `frontend/src/modals/AccessListModal.tsx` — Dialog für Erstellung und Bearbeitung
- `frontend/src/modals/AccessListFormTabs.tsx` — gemeinsame Tab-Navigation mit Formik-gebundenem SSO-Status
- `frontend/src/modals/AccessListModalSubmission.ts` — serialisiert den Formularzustand zum API-Payload
- `frontend/src/modals/AccessListModalValidation.ts` — prüft den Formularzustand vor der Übermittlung
- `frontend/src/modals/AccessListDetailsTab.tsx` — Formik-gebundener Details- und Optionen-Tab
- `frontend/src/modals/AccessListSsoTab.tsx` — Formik-gebundene Authentik-, OAuth2-Proxy- und OIDC-Felder

## Verhalten

- Basic Auth: Benutzername + bcrypt-gehashtes Passwort
- IP-Ranges: Allow/Deny basierend auf Client-IP
- mTLS: Client-Zertifikat-Authentifizierung
- Access-Lists werden in htpasswd-Dateien unter `/data/access/` geschrieben
- Der Details-Tab bindet Name sowie die Optionen „Satisfy Any“ und „Pass Auth“ weiter direkt an denselben
  Formik-Formularzustand des Dialogs. `AccessListDetailsTab.test.tsx` sichert diese Wertebindung.
- Der SSO-Tab bindet Provider und dessen Authentik-, OAuth2-Proxy- oder OIDC-Felder direkt an denselben
  Formik-Formularzustand. `AccessListSsoTab.test.tsx` sichert Provider- und Authentik-Host-Wertebindung.
- Der integrierte Typ `oidc` nutzt `resty.openidc` mit `oidc_discovery_url` und dem Redirect-Pfad `/_oauth2_callback`. Der eigenständige Typ `oauth2_proxy` verwendet den verwalteten Subprozess und standardmäßig `/oauth2/callback`; beide Endpunkte dürfen in Provider-Konfigurationen nicht verwechselt werden.
- Die gemeinsame Tab-Navigation leitet die unveränderten Basic-Auth- und Client-Regeln an die jeweiligen Untertabs
  weiter und sperrt sie bei aktivem SSO weiterhin über den aus demselben Formik-Status abgeleiteten Wert.
- Die Submission-Serialisierung übernimmt die aktive Authentifizierungsart in `meta`, lässt ungenutzte OAuth2- bzw.
  OIDC-Formularfelder und nicht ersetzte Secrets aus und sendet bei deaktiviertem externen mTLS keinen Zertifikatstext.
  Sie reduziert Clients und Credentials auf die editierbaren API-Felder. Das Backend erhält zuvor gespeicherte SSO-Secrets;
  das Auslassen eines Feldes löscht sie auch bei einem Wechsel der Authentifizierungsart nicht.
- Formularinitialisierung und Submission verwenden denselben Parser für ältere JSON-Strings in `meta`. Beim Umbenennen oder Bearbeiten bleiben dadurch auch zusätzliche Metadaten erhalten; der JSON-Text wird nicht als einzelne Zeichen mit numerischen Schlüsseln gespeichert. `AccessListModalSubmission.test.ts` prüft den vollständigen Lade-/Speicherübergang für diese Legacy-Daten.
- Die ausgelagerte Formularvalidierung behält die bisherige Prüfungsreihenfolge und die bestehenden Fehlermeldungen für
  leere Listen, unvollständige SSO- und mTLS-Konfigurationen sowie doppelte Benutzernamen bei.

## Abhängigkeiten

- `internal/nginx.js` — Config-Generierung
- `internal/audit-log.js` — Protokollierung
- `bcryptjs` — Passwort-Hashing

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Konsistente Aktualisierung und Eingabeprüfung

- Änderungen an Optionen, Basic-Auth-Zugangsdaten und IP-Regeln erfolgen zusammen in einer Datenbanktransaktion. Alte Zugangsdaten werden vor dem Einfügen ihrer Ersatzwerte entfernt; sämtliche Schreibvorgänge sind vor dem Neubau der Dateien abgeschlossen.
- Ein leeres Passwort beim Bearbeiten erhält das bestehende Passwort dieses Benutzernamens. Nicht mehr übermittelte Benutzernamen werden entfernt.
- mTLS-Zertifikate und andere Optionen können auch ohne Namensänderung aktualisiert werden.
- Benutzernamen müssen eindeutig sein und dürfen weder Doppelpunkte, Zeilenumbrüche noch Nullbytes enthalten. Clientregeln akzeptieren ausschließlich `allow` oder `deny` mit IPv4, IPv6, gültigem CIDR-Präfix oder `all`.
- IPv4-mapped-IPv6-Regeln werden beim Rendern in IPv4-Regeln übersetzt, damit sie dieselben Clients treffen wie ihre IPv4-Entsprechung. Bei CIDRs ab `/96` wird das Präfix um 96 verringert. Dies berücksichtigt auch vorhandene Listen; native IPv4-/IPv6-Adressen und `all` bleiben unverändert. Mapped-Präfixe unter `/96` werden abgelehnt, weil sie zusätzlich andere IPv6-Netze umfassen und nicht als einzelne IPv4-Regel darstellbar sind.
- Audit-Metadaten enthalten keine OAuth2-Client-Secrets, OAuth2-Cookie-Secrets oder OIDC-Client-Secrets. Die eigentliche Konfiguration behält diese Werte. Passwort-Hinweise haben eine feste Länge und verraten weder Anfangszeichen noch Passwortlänge.

Regressionstest: `backend/test/internal/access-list.spec.js` prüft reale Service-Aufrufe einschließlich Schreibreihenfolge, Rollback, mTLS, Geheimnisbereinigung und Eingabevalidierung.

## Öffentliche SSO-Zugangsdaten und Bearbeitung

Öffentliche Listen-, Detail-, Erstellungs- und Änderungsantworten entfernen `oauth2_client_secret`, `oauth2_cookie_secret` und `oidc_client_secret` sowie deren ältere Camel-Case-Aliase aus `meta`. Ältere JSON-String-Metadaten werden vor der Bereinigung als Objekt normalisiert; ungültige Werte werden als leeres Objekt behandelt. Die Bereinigung gilt auch ohne angeforderte Basic-Auth-Items. `credentials_configured` enthält für diese drei Felder ausschließlich boolesche Angaben zum gespeicherten Zustand. Basic-Auth-Items behalten die vorhandene Maskierung mit leerem `password` und festem Hinweis. Die Antwortbereinigung arbeitet auf einer Kopie, damit ein intern noch zur Konfiguration verwendeter Snapshot seine tatsächlichen Zugangsdaten behält.

Ausgelassene oder leere SSO-Secrets erhalten beim Update den Wert des innerhalb derselben Schreibtransaktion mit `forUpdate()` gelesenen aktuellen Datensatzes. Eine vorherige Rotation wird dadurch nicht aus dem früheren Öffnungssnapshot rückgängig gemacht. Nicht leere Eingaben ersetzen den jeweiligen Wert; alte Aliasnamen werden beim Zusammenführen auf den kanonischen Feldnamen vereinheitlicht. Vertrauenswürdige Konfigurationsaufrufe können weiterhin ausdrücklich unmaskierte Werte verwenden.

Der Dialog initialisiert die drei Secretfelder leer und erkennt anhand von `credentials_configured`, welche Pflichtwerte bereits hinterlegt sind. Er verlangt bei unverändertem SSO keine erneute Eingabe und sendet nur ausdrücklich eingegebene Ersatzwerte. Die vorhandene Öffnungsaktualisierung bleibt Voraussetzung für das Bearbeitungsformular; spätere Cacheänderungen ersetzen den geöffneten Entwurf nicht. `backend/test/routes/service-credentials.spec.js`, `AccessListModal.test.tsx` und `AccessListModalFormValues.test.ts` prüfen diese Verträge.

## Zweite Prüfung: Erstellung, Dateien und Expansionen

Auch beim Erstellen werden Liste, Credentials und Clientregeln in einer Transaktion geschrieben. `items` ist optional, etwa für reine IP- oder SSO-Listen. Als bereits gehasht gelten nur vollständige bcrypt-Hashes; ein Passwort mit bloßem `$2`-Präfix wird weiterhin gehasht.

Die htpasswd-Datei wird vollständig in einer temporären Datei vorbereitet und per Rename ersetzt. Lesende Nginx-Prozesse sehen keine leere oder teilweise geschriebene Credential-Liste. Die Datei erhält Modus `0600`; Backend und Nginx laufen im unterstützten Containerbetrieb unter derselben UID. Fehler beim Schreiben einer externen mTLS-CA werden weitergegeben.

Neugenerierung nach Änderungen lädt `host_domains`, Zertifikate und komplette Zugriffsregeln. Auch beim Löschen der Liste bleibt dadurch die TLS-Zuordnung der Hosts erhalten. Expandierte Proxy-Hosts durchlaufen dieselbe Geheimnisbereinigung wie die Host-API; interne Aufrufe behalten die tatsächlichen Websitepfade. Authentik-URLs und OAuth2-Präfixe werden vor der Nginx-Ausgabe auf sichere Syntax geprüft.

Öffentlich expandierte Proxy-Hosts und die Hostdetails in Erstellungs-/Änderungsantworten beachten zusätzlich die Proxy-Host-Berechtigung: `hidden` liefert keine Hosts, Sichtbarkeit `user` nur eigene aktive Hosts und `all` alle aktiven Zuordnungen. Die Listenübersicht erlaubt weiterhin keine Host-Expansion. Interne Konfigurationsabfragen sind ausdrücklich getrennt davon: Aktualisierung und Löschen einer Liste bearbeiten weiterhin alle betroffenen Hosts, auch wenn der Listenbesitzer sie nicht anzeigen darf. `host-expansion-permissions.spec.js` prüft diese Grenzen mit den tatsächlichen Berechtigungsschemata und SQLite.

Tests: `access-list.spec.js` und `access-list-files.spec.js`, einschließlich echter temporärer Dateien und fehlgeschlagener Dateiersetzung.

## Gemeinsame Aktivierung und Sidecar-Rollback

Erstellen, Ändern und Löschen einer Access List halten die globale Nginx-Konfigurationssperre über Datenbankänderungen, Passwort-/CA-Dateien, Host-Neuaufbau, Prüfung und Reload. Der interne Helfer `bulkGenerateConfigGroupsUnlocked` darf dabei ausschließlich unter einer bereits gehaltenen Sperre aufgerufen werden; ein erneuter Aufruf des gesperrten Bulk-Helfers würde die Queue blockieren.

Für neue Aktivierungen werden htpasswd- und CA-Inhalte unter unveränderlichen, zufällig versionierten Dateinamen gespeichert. Die 256-Bit-Versionskennung ist unabhängig von den Zugangsdaten; sie ist kein Passwort-Hash. Das interne Metadatum `authorization_revision` wählt diese Pfade ausschließlich als geprüfte 64-stellige Hex-Kennung aus. Bereits vorhandene SHA-256-Versionen bleiben lesbar. Neue Klartextpasswörter werden weiterhin mit bcrypt und Kostenfaktor 13 gehasht. Alte laufende Nginx-Worker lesen bis zum erfolgreichen Reload weiter ihre bisherigen Dateien; ein wartender oder abgelehnter Kandidat verändert deren Zugangsdaten nicht. Vorhandene Hosts ohne Versionsmetadatum behalten die bisherigen festen Pfade. Dateipfade akzeptieren ausschließlich positive sichere numerische Listen-IDs unter `${DATA_PATH:-/data}/access` (Standard `/data/access`). Veröffentlichung, Nginx-Rendering und Revisionssnapshots verwenden dafür denselben Pfadhelfer. Die Create-Kompensation bereinigt nur die nach einem erfolgreichen Commit erhaltene Server-ID; eine vom Aufrufer mitgebrachte ID wird dafür nie verwendet.

Externe mTLS-CA-Bundles werden vollständig mit `X509Certificate` geprüft, bevor eine Passwort- oder CA-Datei veröffentlicht wird. Auch die direkte `build`-Funktion stellt bei einem Veröffentlichungsfehler beide vorherigen Dateien atomar wieder her. Bei fehlgeschlagener Aktivierung werden die vorherigen Listeneinstellungen, Passwort-Hashes, Client-Regeln und Host-Zuordnungen sowie die exakten aktiven Konfigurations-/Passwort-/CA-Dateien einschließlich Dateirechten kompensiert. Erst eine erfolgreich aktivierte Änderung erzeugt den entsprechenden Audit-Eintrag.

Auch [GitOps](./gitops.md) verwendet den unveränderlichen Builder: exportierte Laufzeitrevisionen werden
verworfen und Passwort-/CA-Dateien für die lokale Listen-ID neu erzeugt, bevor Hosts aktiviert werden.
Plaintext-Importe landen nur als bcrypt-13-Verifier in der Datenbank; vorhandene bcrypt-/APR1-Werte werden
nicht erneut gehasht. Bei abgelehnter Aktivierung werden Listenfelder und Kindrelationen vor dem erneuten
Laden der alten Hostkonfiguration wiederhergestellt. Kandidatendateien bleiben für eventuell noch auslaufende
Worker erhalten. Fehlende, aber weiterhin zugewiesene Listen werden beim Full Sync nicht stillschweigend gelöscht.

`access-list-activation.spec.js` prüft diese Abläufe mit SQLite und PostgreSQL/PGlite. Der zusätzliche Test mit laufenden Nginx-Workern hält die Ablehnung eines Kandidaten gezielt offen: Die bisherigen Zugangsdaten liefern weiter HTTP 200, die Kandidatenzugangsdaten HTTP 401. Danach wird die ursprüngliche Konfiguration weiter bedient.

Mit `SHIELDPM_NGINX_TEST_BINARY` als Pfad zur Testbinärdatei führt der zusätzliche Integrationstest einen echten `nginx -tq` aus: Ein syntaktisch ungültiger Kandidat wird abgelehnt, während die wiederhergestellte alte Konfiguration ihre gültige CA- und Passwortdatei behält.

## Verwandte Seiten

- [Proxy-Host](./proxy-host.md)
- [Zertifikate](./zertifikate.md)
- [Interne PKI](./pki.md)
- [IP-Ranges](./ip-ranges.md)
- [Benutzer & Auth](./benutzer-auth.md)
- [OAuth2-Proxy (SSO)](./oauth2-proxy.md)
- [Modulübersicht](./README.md)
- [Host-Revisionen](../features/host-revisionen.md)
