# Zertifikate

## Zweck

Verwaltung von SSL/TLS-Zertifikaten (Let's Encrypt, Custom).

## Kontext

ShieldPM automatisiert die Zertifikatsverwaltung über Let's Encrypt (ACME) und unterstützt eigene Zertifikate.

## Wichtige Dateien

- `backend/internal/certificate.js` (27 KB) — Business-Logik
- `backend/internal/certbot.js` (10 KB) — Let's Encrypt Automatisierung
- `backend/internal/acme-profile.js` — Globale Profilvorgabe, Prüfung und Einstellungs-API
- `backend/internal/pki.js` (7 KB) — Interne CA / ML-KEM
- `backend/models/certificate.js` (3 KB) — Objection.js-Modell
- `backend/routes/nginx/certificates.js` (10 KB) — API-Routen
- `backend/certbot/` — Certbot-Hilfsdateien

## Verhalten

- Zertifikate werden über ACME (Let's Encrypt) automatisch beantragt
- Die Datenbankeinstellung `certificate-options.meta.renewal_interval_hours` steuert das Intervall zwischen `certbot renew`-Prüfungen, nicht die verbleibende Zertifikatslaufzeit. Gültig sind ganze Stunden von **1 bis 12**, Standard ist **12 Stunden**. Unter Einstellungen → Zertifikate / ACME gespeicherte Änderungen ersetzen den laufenden Timer ohne Neustart und ohne zusätzliche Sofortprüfung. Beim Backend-Start erfolgt weiterhin sofort eine Prüfung. Die Prüfung erzwingt keine Erneuerung; Certbot bestimmt die Fälligkeit selbst.
- Zertifikate werden unter `/data/tls/` gespeichert
- Unterstützt ECDSA und RSA Schlüsseltypen

## Globale Zertifikatsoptionen

`certificate-options` speichert `key_type: "ecdsa" | "rsa"` und `renewal_interval_hours: 1..12` in `setting.meta`. Die UI bietet beide Felder unter Einstellungen → Zertifikate / ACME an. Der Schlüsseltyp wird bei neuen Ausstellungen sowie manuellen und automatischen Erneuerungen als `--key-type` weitergegeben, auch für bestehende Certbot-Lineages. Speichern allein ersetzt keine Zertifikatsdateien und löst keine erzwungene Erneuerung aus. Eine bereits laufende automatische Prüfserie behält den zu ihrem Beginn geladenen Schlüsseltyp; die neue Wahl gilt für die nächste Serie.

Die Anlage-Migration übernimmt vorhandene `ACME_KEY_TYPE`-/`CRT`-Werte einmalig für fehlende Einstellungsdatensätze; danach gilt ausschließlich die Datenbankwahl. API und Validierung stehen unter [Einstellungen](../verwaltung/einstellungen.md#zertifikats--und-netzwerkoptionen).

## ACME-Profile

- Bei einer neuen Let's-Encrypt-Ausstellung wird `meta.letsencrypt_profile` als `standard` oder `shortlived` gespeichert. Fehlende Angaben in neuen API-Anfragen werden auf das aktuell wirksame globale Profil aufgelöst. Nach der Ausstellung bleibt diese explizite Wahl trotz späterer Änderungen der globalen Vorgabe erhalten.
- Der Einstellungsdatensatz `acme-profile` speichert die globale Vorgabe ausschließlich in der Tabelle `setting`. Die Anlage-Migration verwendet `value: "standard"`, ohne bestehende Werte zu überschreiben. Die Normalisierungsmigration ersetzt einen früheren `inherit`-Wert durch `standard` und erhält explizit gespeicherte Standard-/Short-lived-Werte. Ältere Zertifikate ohne Profilmetadaten verwenden die globale Vorgabe bei der Erneuerung.
- Administratoren speichern unter Einstellungen → Zertifikate / ACME `standard` oder `shortlived`. Die Einstellung wirkt auf nachfolgende Aufträge ohne Neustart und ohne Änderung der Umgebungsdateien oder Certbot-INI. Neue Zertifikate ohne individuelle Wahl verwenden sie; ältere Zertifikate ohne Profilfeld übernehmen sie bei der nächsten Erneuerung. Bereits explizit gespeicherte Zertifikatsprofile werden nicht überschrieben und die Einstellung allein löst keine sofortige Neuausstellung aus.
- Beide Profilwahlen benötigen Certbot ab Version 4.0. `shortlived` verlangt strikt das gleichnamige CA-Profil und erlaubt höchstens **25 Domainnamen** pro Zertifikat. Bei Let's Encrypt beträgt dessen Laufzeit **160 Stunden (6 Tage und 16 Stunden)**. `standard` leert bei jedem Auftrag erforderliche und bevorzugte Certbot-Profile, sodass frühere INI-/Lineage-Vorgaben nicht weiterwirken und die CA ihren Standard und dessen Laufzeit wählt. Beide Auswahlen können gemeinsam genutzt werden.
- Die Auswahl steht in HTTP-/DNS-Zertifikatsdialogen sowie beim Anfordern eines neuen Zertifikats aus Host-Dialogen zur Verfügung. Host-Anfragen mit `certificate_id: "new"` reichen das Profil an die Zertifikatsausstellung weiter. Bereits zugewiesene Zertifikate werden durch Änderungen an Host-Metadaten nicht umgestellt.
- Das Profil eines bestehenden Zertifikats wird nicht über die Bearbeitung gewechselt. Ein Wechsel erfolgt durch eine neue Ausstellung und die anschließende Host-Zuordnung. Interne und hochgeladene Zertifikate verwenden diese ACME-Auswahl nicht.
- Manuelle und automatische Erneuerung übernehmen die explizite Profilwahl jedes gespeicherten Zertifikats. Die automatische Prüfung ruft `certbot renew` ohne erzwungene Erneuerung pro Zertifikat auf, damit globale Profile die individuelle Wahl nicht überschreiben. Ein Fehler stoppt die Prüfungen der übrigen Zertifikate nicht. Details stehen unter [Certbot](./certbot.md).
- `GET /api/nginx/certificates/acme-profile` verlangt `certificates:list` und liefert ausschließlich `{ "profile": "standard" | "shortlived" }`. Der administrative PUT verlangt `settings:update`. Vor dem Speichern wird Certbots Profilunterstützung geprüft; Short-lived verlangt zusätzlich das vom ACME-Verzeichnis angebotene Profil. Bei einem Fehler bleibt die vorherige Einstellung unverändert. Der generische Settings-PUT für `acme-profile` wird abgewiesen, damit er diese Prüfung nicht umgeht.
- Proxy-, Redirection-, Dead-Hosts und Streams lösen die Profilwahl und die Begrenzung auf 25 Short-lived-Domains bereits vor ihren Datenbankänderungen auf. Ein globales Short-lived-Profil greift damit auch für Inline-Ausstellungen ohne ausdrücklich mitgesendetes Profil.

## Sicherheits- und Lebenszyklusregeln

- API-Antworten enthalten vorhandene PEM-Dateien als boolesche Metadatenmarker. Private Schlüssel und DNS-Zugangsdaten werden dort und in Zertifikats-Auditdaten nicht zurückgegeben. Expandierte Proxy-Hosts werden ebenfalls von Verbindungsgeheimnissen bereinigt.
- Der berechtigte Zertifikatsdownload liefert weiterhin die erforderlichen Dateien; temporäre ZIPs werden mit Modus `0600` erstellt und nach dem Download gelöscht.
- Client-Zertifikatsausstellung verlangt `certificates:create`; jeder Auftrag nutzt ein eigenes temporäres Verzeichnis. Das öffentliche Root-CA-Zertifikat bleibt ohne Geheimnisse abrufbar.
- Private Schlüssel werden mit Node.js Crypto im Speicher geprüft. Passwortgeschützte Schlüssel scheitern sofort; ein Upload prüft außerdem die Übereinstimmung zwischen Zertifikat und Schlüssel vor der Datenbankänderung.
- Manuelle Erneuerung und erfolgreicher Upload laden Nginx neu, damit es die neuen Dateien verwendet.
- Custom-Uploads schreiben das vollständige Dateipaar zunächst in ein privates Staging-Verzeichnis. Austausch, Reload und Datenbankänderung laufen unter der gemeinsamen Nginx-Konfigurationssperre; scheitert die Aktivierung, wird das vorige Dateipaar wiederhergestellt. Die Datenbank wird erst nach erfolgreichem Reload aktualisiert. Backup-Bereinigungsfehler werden protokolliert, ohne eine bereits erfolgreiche Aktivierung rückgängig zu machen.
- Upload, manuelle Erneuerung und Löschen desselben Zertifikats schließen sich gegenseitig aus. Ein Zertifikatsprovider kann nach Erstellung nicht gewechselt werden, weil damit andere Dateipfade und ein anderer Lebenszyklus verbunden wären.
- IDs werden vollständig als positive sichere Ganzzahlen geprüft; Werte wie `1abc` werden nicht mehr als Zertifikat 1 interpretiert. Mehrere Upload-Dateien für dasselbe PEM-Feld liefern einen Validierungsfehler.
- Erstellungsanfragen verwenden ein eigenes Schema (`certificate-request.json`): Let's Encrypt/interne Zertifikate brauchen mindestens einen gültigen DNS-Namen, DNS-Challenges zusätzlich Provider und nichtleere Zugangsdaten, interne Laufzeiten liegen zwischen 1 und 10 Jahren. Interne Einzelhostnamen und internationale Domainnamen werden unterstützt. Das Antwortschema beschreibt die booleschen PEM-Präsenzmarker getrennt von Eingabedaten.
- Fehlgeschlagene interne Ausstellungen entfernen ihre Teildateien. Scheitert erst das Audit nach erfolgreicher Ausstellung, bleibt das ausgestellte Zertifikat erhalten. Alle erfolgreichen Erstellungsarten lösen den GitOps-Autopush aus.
- Downloadnamen enthalten eine zufällige UUID; fehlende Quelldateien brechen das Archiv ab, statt ein unvollständiges ZIP als erfolgreichen Download zurückzugeben. Fehlerhafte Archive werden entfernt.
- Verwaiste Zertifikatsverweise, manuelle und automatische Erneuerungs-Reloads verwenden dieselbe Nginx-Konfigurationssperre wie Host-Änderungen und Uploads. Beim Löschen werden Host-Verweise zuerst entfernt und die neue Konfiguration geladen, während die bisherigen TLS-Dateien noch existieren. Ein fehlgeschlagener Ladevorgang stellt Host-Felder und Konfigurationsdateien wieder her, behält die Schlüssel und setzt die Löschmarkierung zurück. Erst danach werden Dateien entfernt und das Audit geschrieben.
- Das Löschen von Let's-Encrypt-Zertifikaten reserviert zusätzlich die Certbot-Prozesssperre vor Löschmarkierung und Host-Änderungen. Läuft bereits eine Erneuerung oder Ausstellung, scheitert die Löschanfrage ohne diese Änderungen. Fehler beim anschließenden ACME-Widerruf werden weitergegeben; bereits erfolgreich geladene Host-Abkopplungen bleiben bestehen.
- Das Löschen interner Zertifikate räumt `/data/tls/internal/` auf. Die Bereinigung verwaister Zertifikatsverweise lädt Domains und Zugriffslisten nach, entfernt Konfigurationen deaktivierter Hosts und setzt den erfolgreichen Nginx-Status erst nach dem validierten Reload.
- Zertifikatsdaten werden als GMT interpretiert; der Common Name wird gezielt aus `CN` gelesen, auch wenn im Subject zuerst Länder- oder Organisationsfelder stehen.

## Regressionstests

- `backend/test/internal/certificate-lifecycle.spec.js` — einschließlich Profilpersistenz, maximaler Short-lived-Domainanzahl, gemischter Erneuerung, Fehlerisolation und Timergrenzen
- `backend/test/routes/certificate-issuance-permissions.spec.js`
- `backend/test/schema/certificate-validation.spec.js`

## Abhängigkeiten

- `internal/nginx.js` — Reload nach Zertifikatserneuerung
- `internal/audit-log.js` — Protokollierung

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Proxy-Host](./proxy-host.md)
- [Certbot](./certbot.md)
- [Einstellungen](../verwaltung/einstellungen.md)
- [Interne PKI](./pki.md)
- [Access-Lists](./access-lists.md)
- [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)
- [Modulübersicht](./README.md)
