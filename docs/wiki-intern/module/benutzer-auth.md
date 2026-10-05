# Benutzer & Auth

## Zweck

Benutzerverwaltung, Authentifizierung und Autorisierung.

## Kontext

ShieldPM verwendet JWT-basierte Authentifizierung mit optionalem 2FA und OIDC.

## Wichtige Dateien

- `backend/internal/user.js` (17 KB) — Benutzer-Business-Logik
- `backend/internal/token.js` (6 KB) — JWT-Token-Verwaltung
- `backend/internal/oauth2-proxy.js` (7 KB) — SSO-Integration (OAuth2 Proxy)
- `backend/internal/auth-session-service.js` (6 KB) — Session-Verwaltung
- `backend/models/user.js` (2 KB) — Benutzer-Modell
- `backend/models/auth.js` (2 KB) — Auth-Modell
- `backend/models/auth-session.js` (3 KB) — Session-Modell
- `backend/models/user_permission.js` (1 KB) — Berechtigungen
- `backend/routes/tokens.js` (22 KB) — Login/Token-API
- `backend/routes/users.js` (10 KB) — Benutzer-API
- `backend/routes/oidc.js` (7 KB) — OIDC-API
- `backend/password-reset.js` (2 KB) — Passwort-Reset-Script

## Verhalten

- Login über E-Mail + Passwort → JWT-Token
- OIDC-Login über OpenID Connect Provider
- Session-Verwaltung mit Geräte-Tracking
- Berechtigungssystem (Permissions pro Benutzer)
- Passwort-Hashing mit `bcryptjs`
- JWT-Signierung mit den Schlüsseln aus `/data/shieldpm/keys.json` (`backend/lib/config.js`); das Startskript migriert einen alten `/data/keys.json`-Pfad.

## Abhängigkeiten

- `jsonwebtoken` — JWT
- `bcryptjs` — Hashing
- `openid-client` — OIDC
- `internal/audit-log.js` — Protokollierung

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Konten, Passwörter und Erstinstallation

- Lokale Zugangsdaten verwenden ausschließlich `type=password`; nicht unterstützte Typen werden vor dem Speichern abgelehnt. Neue Passwörter benötigen mindestens acht Zeichen und dürfen höchstens 72 UTF-8-Bytes enthalten, damit bcrypt keine unterschiedlichen Eingaben auf denselben Präfix kürzt.
- Die Passwortprüfung und Passwortänderung berücksichtigen nur aktive Passwortdatensätze. Gelöschte Zugangsdaten und andere Authentifizierungstypen bleiben unverändert.
- Passwortänderung und Widerruf aller noch aktiven Refresh-Sitzungen des Benutzers werden gemeinsam in einer Datenbanktransaktion gespeichert. Scheitert der Widerruf, bleibt das bisherige Passwort erhalten. Bereits ausgestellte Access-JWTs bleiben bis zu ihrem Ablauf gültig; der Widerruf ist keine sofortige Sperre dieser zustandslosen Tokens.
- Bei der Erstinstallation werden Benutzer, Passwort und Berechtigungen gemeinsam gespeichert. Die über `INITIAL_ADMIN_EMAIL` gelesene Adresse wird wie beim Login normalisiert. Eine fehlgeschlagene Initialisierung hinterlässt keinen scheinbar fertig eingerichteten Benutzer ohne Zugangsdaten.
- Die anonyme erste Benutzeranlage verlangt Passwortdaten und prüft den Einrichtungszustand innerhalb ihrer Transaktion erneut. Eine Sperre des zuvor angelegten `default-site`-Datensatzes serialisiert konkurrierende Erstinstallationen unter PostgreSQL/MySQL; SQLite serialisiert beziehungsweise verwirft konkurrierende Schreibtransaktionen. Fehlt der Initialisierungsdatensatz, wird die Anlage abgelehnt.
- Jede Benutzeranlage und jede Profiländerung mit E-Mail sperrt denselben `default-site`-Datensatz und prüft die Verfügbarkeit erst danach innerhalb der Schreibtransaktion. PostgreSQL-Claim-Transaktionen starten ausdrücklich mit `READ COMMITTED`, damit auch bei einem abweichenden Serverstandard nach dem Warten auf die Sperre der letzte erfolgreiche Anspruch sichtbar ist. SQLite und MySQL behalten ihre vorhandenen Transaktionseinstellungen. Damit können konkurrierende Anlagen, Änderungen und gemischte Anfragen keine zwei nicht gelöschten Konten mit derselben normalisierten Adresse erzeugen. Deaktivierte Konten behalten ihre Adresse; nach Softdelete darf sie wiederverwendet werden. Profiländerungen ohne E-Mail benötigen diese Sperre nicht.
- Die Verfügbarkeitsprüfung sowie Passwort- und OIDC-Anmeldung vergleichen gebundenes `LOWER(TRIM(email))` mit der normalisierten Eingabe. Auch historische Unterschiede in Groß-/Kleinschreibung und äußeren Leerzeichen werden dadurch berücksichtigt. Mehr als ein nicht gelöschter Treffer wird mit dem bestehenden Authentifizierungsfehler abgelehnt, einschließlich eines deaktivierten zweiten Kontos; ein einzelner deaktivierter Treffer darf ebenfalls nicht anmelden. Beim Passwortlogin bleibt die Dummy-bcrypt-Prüfung erhalten. Bestehende Datensätze werden nicht automatisch bereinigt und erhalten keinen neuen E-Mail-Index.
- Verlässt der Benutzer die Einrichtungsseite während der ersten Benutzeranlage, startet deren verspätete Antwort keinen automatischen Login mehr. Der Health-Status wird nach erfolgreicher Anlage trotzdem neu geladen, damit die Oberfläche den abgeschlossenen Einrichtungszustand erkennt. `frontend/src/pages/Setup/index.test.tsx` prüft diesen Ablauf sowie die Aktualisierung nach fehlgeschlagenem automatischem Login.
- Berechtigungsänderungen übernehmen ausschließlich die unterstützten Berechtigungsfelder. Die Benutzer-ID aus der Route ersetzt niemals die eigene ID der Berechtigungszeile; `user_id` kann nicht auf einen anderen Benutzer umgebogen werden.

Regressionen mit SQLite: `backend/test/internal/account-transactions.spec.js` und `backend/test/internal/setup-state.spec.js`; Passwortgrenzen: `backend/test/lib/password-auth.spec.js`. `backend/test/internal/user-email-claims.spec.js` prüft normalisierte Adressen, Softdelete-Wiederverwendung, konkurrierende Anlagen/Änderungen, gemeinsame Transaktionsbindung und mehrdeutige historische Logins mit SQLite und PostgreSQL über PGlite. PostgreSQL prüft außerdem den tatsächlichen Isolationslevel und das vor der ersten Claim-Abfrage erzeugte `BEGIN TRANSACTION ISOLATION LEVEL read committed`, auch mit `REPEATABLE READ` als Serverstandard. Der eingebettete PostgreSQL-Test verwendet eine Verbindung; er prüft echtes SQL und die Reihenfolge mit `FOR UPDATE`, jedoch keine Sperrwartezeiten zwischen mehreren PostgreSQL-Serververbindungen.

## Passwort-Reset per CLI

`npm-reset-password <E-Mail> <neues-Passwort>` verwendet `backend/password-reset.js` und die vorhandene SQLite-Datei unter `${DATA_PATH:-/data}/shieldpm/database.sqlite`. Ohne beide Argumente, bei unbekanntem oder gelöschtem Benutzer sowie bei einem Passwort über 72 UTF-8-Bytes bricht das Werkzeug ab. Es verändert ausschließlich aktive Passwortdatensätze dieses Benutzers und widerruft dessen Refresh-Sitzungen in derselben Transaktion. Andere Authentifizierungsmethoden, gelöschte Zugangsdaten und fremde Sitzungen bleiben erhalten. Für MySQL/PostgreSQL ist dieser SQLite-Notfallhelfer nicht zuständig; reguläre Passwortänderungen laufen über die Benutzerverwaltung.

Der im Docker-Image installierte Symlink `/usr/local/bin/password-reset.js` führt denselben CLI-Einstieg aus wie der direkte Aufruf von `/app/password-reset.js`. Der Einstieg wird über `import.meta.main` erkannt; ein Symlink darf weder einen wirkungslosen Erfolg melden noch Fehlerargumente überspringen. `password-reset-cli.spec.js` startet den tatsächlichen Node-Prozess über einen Symlink und prüft Passwortänderung, Sitzungswiderruf und Fehlercodes mit SQLite.

## Profiländerungen und Avatare

- Eigene Profilfelder bleiben über `users:update` bearbeitbar. Änderungen an `roles` oder `is_disabled` benötigen zusätzlich `users:permissions`; unveränderte Werte dürfen im Profilformular mitgesendet werden, werden aber nicht erneut geschrieben. Dadurch kann ein gewöhnliches Profilupdate keinen zwischenzeitlichen Rollenentzug oder eine Kontosperre zurücksetzen.
- Neue Benutzer unterstützen Gravatar und benutzerdefinierte Avatar-URLs. Ein Datei-Upload erfolgt nach dem Anlegen über den Upload-Endpunkt.
- Bei einem Avatar-Upload wird die bisherige Datei erst nach erfolgreichem Speichern der neuen Datei und ihres Datenbankverweises entfernt. Ein fehlgeschlagenes Datenbankupdate entfernt die neue Datei und erhält das bisherige Bild. Zufällige Dateinamen vermeiden Kollisionen gleichzeitiger Uploads.
- Dateibasierte Avatare müssen einen reinen Dateinamen mit dem Präfix der Benutzer-ID besitzen. Lesezugriffe und das Entfernen eines bisherigen Avatars prüfen dieselbe Grenze; Pfadwechsel sowie Dateien anderer Benutzer werden zurückgewiesen.

## OIDC-Anmeldung

- Deaktiviertes OIDC wird an Start, Callback und Claim serverseitig abgewiesen. Interne Provider- und Datenbankfehler werden nicht an den Browser ausgegeben.
- Das verschlüsselte JWT für die Übergabe vom Callback an den Claim ist wie sein Cookie höchstens fünf Minuten gültig.
- Der temporäre OIDC-Cookie für Nonce und State ist HTTP-only, fünf Minuten gültig und verwendet `SameSite=Lax`, damit er bei der Navigation vom Identity Provider zurück ankommt.
- Der Callback verlangt beide Werte aus dem Cookie und übergibt sie als erwartete Werte an `openid-client`. Ohne gültigen State wird kein Autorisierungscode eingelöst.
- Erst nach erfolgreicher Callback-Validierung ersetzt OIDC die Anmeldung dieses Browsers: Access-, Refresh-, Impersonation-Backup- und ausstehende Duo-Cookies werden mit ihren jeweiligen Pfaden entfernt. Bestehende Datenbanksitzungen anderer Geräte bleiben erhalten. Bei einem Callback-Fehler bleibt die bisherige Browsersitzung erhalten. Der erfolgreiche Callback leitet mit dem verschlüsselten Übergabecookie auf `/` weiter; ohne altes Refresh-Cookie kann der Login-Claim dort zuerst die neue Sitzung übernehmen und danach das Dashboard anzeigen.
- `/api/oidc/claim` verifiziert das entschlüsselte JWT einschließlich Signatur und Ablauf sowie den aktiven Benutzer. Anschließend erzeugt es das reguläre Access-/Refresh-Token-Paar und entfernt den temporären Cookie.
- Die öffentlichen OIDC-Routen setzen kein bestehendes gültiges API-Token voraus; auch eine Anmeldung nach Ablauf eines bisherigen Cookies ist möglich.
- `GET /api/settings/oidc-config` liefert den öffentlichen Provider-Namen und dessen Aktivierungsstatus unabhängig von vorhandenen Zugangsdaten. Abgelaufene, fehlerhafte oder inzwischen gesperrte JWTs sowie gewöhnliche Benutzer dürfen diese Login-Information lesen. Die Ausnahme gilt nur für diesen GET-Endpunkt; private Einstellungen und Änderungen benötigen weiterhin ihre regulären Berechtigungen.
- Die Login-Seite startet pro Instanz nur einen OIDC-Claim, auch bei wiederholter Effekt-Ausführung im React-StrictMode. Nach Verlassen der Seite übernimmt sie keine verspätete Claim-Antwort mehr. Ein ausdrücklich gestarteter Passwortlogin verwirft die OIDC-Annahme und wartet vor seinem eigenen Request auf den bereits laufenden Claim, damit dessen Cookie-Antwort die Passwortsitzung nicht nachträglich ersetzt. Auch ein fehlgeschlagener Claim gibt den Passwortlogin frei; nach Verlassen der Seite wird ein noch wartender Passwortrequest nicht mehr gestartet. `frontend/src/pages/Login/index.test.tsx` prüft diese Reihenfolge und Lebenszyklusgrenzen.

Regressionstests: `backend/test/internal/user-security.spec.js` und `backend/test/routes/oidc-security.spec.js`. `backend/test/routes/auth-response-contracts.spec.js` prüft über echte HTTP-Anfragen die Cookiepfade und die Folge Callback → Startup-Refresh → Claim sowie den Erhalt der alten Sitzung bei einem Callback-Fehler. `backend/test/routes/oidc-public-settings.spec.js` verbindet die echte Express-Route mit JWT-Prüfung, Berechtigungen und SQLite und prüft die öffentlichen Antworten sowie weiterhin gesperrte private Lese- und Schreibzugriffe.

## CSRF bei Sitzungswechseln

Vor den CSRF-Ausnahmen, der CSRF-Token-Erzeugung und dem Body-Parser prüft `backend/app.js` den Content-Type aller POSTs unter `/tokens` beziehungsweise `/api/tokens` sowie der anonymen ersten Benutzeranlage. Erlaubt sind `application/json` mit optionalen Parametern und Anfragen ohne Content-Type, wenn weder Transfer-Encoding noch eine positive Content-Length einen Body ankündigen. Andere Formate, einschließlich der drei einfachen Browser-Formtypen, erhalten `415` ohne Set-Cookie und ohne Routenausführung. JSON-Anmeldungen, 2FA, Logout, Restore und JSON-Refresh-Token im Body bleiben möglich; native leere Cookie-Aufrufe benötigen keinen Content-Type. Die Entscheidung benötigt weder Origin noch Host- oder Proxy-Header. Andere API-Formparser und die OIDC-GET-Callbacks behalten ihre vorhandenen Verträge.

`backend/test/routes/auth-content-type.spec.js` verbindet diesen Guard mit der echten App, den Token-/Benutzerrouten, RSA-JWTs und SQLite. Die Tests decken die drei Formtypen bei Login, Refresh und Erstinstallation mit und ohne `/api`-Präfix ab, prüfen frühe Ablehnungen ohne Cookieänderung für weitere Token-POSTs sowie JSON mit Charset, Refresh-Bodyfallback, native leere Cookie-Aufrufe und nicht leere Anfragen ohne Content-Type. Ein fehlgeschlagener leerer Refresh erzeugt weiterhin keinen CSRF-Cookie. Die Erstinstallation und andere API-Formparser haben erfolgreiche Kontrollfälle.

Nach Passwortlogin, erfolgreichem zweiten Faktor, OIDC-Claim, Refresh, Impersonation und Restore wird der CSRF-Token gegen die Benutzeridentität des ausgehenden Access-Cookies erzeugt. Die Antwort liefert ihn als `csrfToken` und über `X-XSRF-TOKEN`; ein bereits zur selben Identität passender Token bleibt beim Refresh erhalten. Die nächste schreibende Anfrage benötigt dadurch keinen vorgeschalteten Health-Aufruf. Beim Logout werden die Auth-Cookies gelöscht und der zur anonymen Sitzung passende Token über den Antwortheader übertragen; der Status bleibt `204`.

Ein verspäteter Health-Aufruf kann im Browser dennoch einen älteren CSRF-Cookie setzen. Ausschließlich die Ablehnung durch die CSRF-Middleware trägt deshalb neben dem numerischen Fehlercode `403` den Zusatz `error.reason: "EBADCSRFTOKEN"`. Zu diesem Zeitpunkt ist noch keine Route ausgeführt worden. Der API-Client darf nach einem neuen Health-Aufruf exakt einmal wiederholen, solange sich die Sitzung nicht geändert hat. Ein gewöhnlicher Berechtigungsfehler erhält diesen Zusatz nicht.

`backend/test/routes/csrf-session-transitions.spec.js` prüft diese Übergänge mit der echten App, CSRF-Middleware, RSA-JWTs und SQLite. Der verzögerte Health-Ablauf prüft zusätzlich, dass die abgewiesene Anfrage keine Route ausführt und der anschließende Versuch genau einmal schreibt. Die einzelnen externen 2FA-Verifizierungen werden in diesem Übergangstest simuliert; deren Kryptografie und Einmalverwendung haben eigene Integrationstests.

## Demo-Konten

Der Demo-Modus sperrt alle schreibenden Methoden im `/users`-Namensraum. Dazu zählen auch 2FA-Einrichtung, das Ersetzen von Wiederherstellungscodes und Avatar-Uploads. Der Schutz greift vor der Dekodierung einzelner Express-Parameter; kodierte oder teilweise numerische Benutzer-IDs umgehen die Sperre nicht. Lesende Kontozugriffe bleiben möglich.

Regression: `backend/test/lib/third-auth-demo.spec.js` prüft die tatsächliche Express-Routenauflösung.

## Verwandte Seiten

- [2FA-Service](./2fa.md)
- [OAuth2-Proxy (SSO)](./oauth2-proxy.md)
- [Access-Lists](./access-lists.md)
- [Audit-Log](../verwaltung/audit-log.md)
- [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)
- [Modulübersicht](./README.md)
