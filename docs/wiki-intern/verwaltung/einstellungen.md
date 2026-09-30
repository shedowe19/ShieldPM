# Einstellungen

## Zweck

Verwaltung von globalen Systemeinstellungen (Standard-Seite, Default-Site, OIDC-Settings, AI-Settings, GitOps-Settings, Anubis-Settings usw.).

## Kontext

Die Anwendung benötigt globale Konfigurationswerte, die in der Datenbank gespeichert und über die API verwaltet werden. Die Werte werden u. a. von der Nginx-Engine, dem AI-Modul und den Login-Routen ausgelesen.

## Wichtige Dateien

- `backend/internal/setting.js` — Business-Logik für Einstellungen
- `backend/internal/acme-profile.js` — Geprüfte ACME-Profilvorgabe und dedizierte API
- `backend/internal/certificate-options.js`, `backend/internal/ip-ranges-options.js` — Validierte Anwendungsoptionen mit Live-Anwendung
- `backend/models/setting.js` — Einstellungs-Modell
- `backend/routes/settings.js` — REST-API unter `/api/settings`
- `frontend/src/pages/Settings/` — UI mit Tabs (DefaultSite, ACME/Zertifikate, Netzwerk, Ai, GitOps, Layout)

## Verhalten

- `setting.js` ermöglicht das Lesen und Aktualisieren von Systemeinstellungen.
- Einzelne Settings werden per Key gespeichert (z. B. `default-site`, `oidc-config`).
- Die OIDC-Anmeldung verwendet den vorhandenen Datensatz `oidc-config` (Initialwert `metadata`). Ein Administrator aktualisiert ihn mit `PUT /api/settings/oidc-config` und einem Request-Body der Form `{ "meta": { "enabled": true, "name": "...", "issuerURL": "...", "clientID": "...", "clientSecret": "...", "redirectURL": "..." } }`. `redirectURL` bezeichnet `/api/oidc/callback` an der öffentlichen ShieldPM-Adresse und muss beim Identity Provider registriert sein. Das Metadatenobjekt wird bei jedem Update vollständig ersetzt; die öffentliche GET-Antwort enthält nur Name und Aktivierungsstatus und kann die übrigen Felder nicht für ein späteres Update rekonstruieren. Die Login-Seite zeigt derzeit keinen OIDC-Startknopf; der Flow beginnt über `GET /api/oidc`.
- Änderungen an `default-site` erzeugen und prüfen Nginx-Konfiguration und laden Nginx neu. Andere Schlüssel werden als Datenbankwerte aktualisiert; abhängige Module lesen sie bei Bedarf. `setting.js` startet keinen generischen Service-Neustart.
- Die Default-Site-Variante mit eigenem HTML zeigt Validierungsfehler direkt unter dem beschrifteten Editor an und verknüpft sie über `aria-describedby`; ein leerer Inhalt kann nicht gespeichert werden. Regression: `frontend/src/pages/Settings/DefaultSite.test.tsx`.
- Ein fehlgeschlagenes Nachladen der Default-Site-Einstellung zeigt bei bereits vorhandenen Daten einen Fehler im weiterhin geöffneten Formular. Ungespeichertes HTML bleibt auch bei anschließender Wiederherstellung der Verbindung erhalten. Scheitert das erste Laden ohne Daten, wird kein Formular mit Ersatzwerten angeboten.
- AI-Modelllisten gelten nur für die Verbindung, mit der sie angefordert wurden. Änderungen an Provider, Base-URL oder API-Key verwerfen geladene Optionen und ausstehende Antworten einschließlich deren Fehlern. Auch ein Wechsel zurück zum vorherigen Wert reaktiviert keine ältere Anfrage. Regression: `frontend/src/pages/Settings/Ai.test.tsx`.
- GitOps-Einstellungen werden erst nach erfolgreichem Laden bearbeitbar. Ungespeicherte Änderungen sperren Aktionen gegen die bisher gespeicherte Repository-Konfiguration; siehe [GitOps](../module/gitops.md).

## Globale ACME-Profilvorgabe

Einstellungen → Zertifikate / ACME (`frontend/src/pages/Settings/Certificates.tsx`) bietet Administratoren die globale Auswahl Standard oder Short-lived. Die Datenbank speichert sie im Datensatz `setting.id: "acme-profile"`; die Migration `20260930000000_add_acme_profile_setting.js` ergänzt `value: "standard"` und überschreibt einen bereits vorhandenen Datensatz nicht. `20260930000100_normalize_acme_profile_setting.js` ersetzt den früheren internen Wert `inherit` durch `standard`, erhält explizit gespeicherte Profilwahlen und liest keine Umgebungswerte.

`GET /api/nginx/certificates/acme-profile` ist mit `certificates:list` zugänglich und liefert ausschließlich `{ "profile": "standard" | "shortlived" }`. `PUT` verlangt `settings:update` und denselben Body; seine Antwort enthält ebenfalls nur das gespeicherte Profil. Der generische Settings-PUT für `acme-profile` wird abgewiesen, damit er die vorgesehene Prüfung nicht umgeht.

Vor dem Speichern prüft der Service die Unterstützung der Certbot-Profiloptionen; für Short-lived zusätzlich das angebotene `shortlived`-Profil des konfigurierten ACME-Verzeichnisses. Scheitert eine Prüfung, bleibt der gespeicherte Wert unverändert. Eine erfolgreiche Änderung wirkt auf nachfolgende Zertifikatsaufträge ohne Dienstneustart und ohne Änderung von Umgebungsdateien oder Certbot-INI. Sie erzeugt allein noch kein neues Zertifikat.

Eine globale Short-lived-Vorgabe wird außerdem abgewiesen, wenn ein aktives älteres Let's-Encrypt-Zertifikat ohne gespeichertes Profil mehr als 25 Domainnamen enthält. Dadurch wird dessen spätere Erneuerung nicht auf ein unzulässiges Profil umgestellt. Standard bleibt verwendbar; alternativ können die betroffenen Zertifikate durch explizite Standard-Zertifikate ersetzt oder auf Short-lived-Zertifikate mit höchstens 25 Namen aufgeteilt werden. Nach der Host-Neuzuordnung müssen die ersetzten Altzertifikate entfernt werden, da die Prüfung alle nicht gelöschten Let's-Encrypt-Zertifikate berücksichtigt. Zertifikate mit explizit gespeichertem Standard-Profil verhindern die Änderung nicht.

Neue Zertifikatsanfragen ohne individuelle Wahl verwenden die globale Vorgabe und speichern das aufgelöste Profil im Zertifikat. Neue HTTP-/DNS- und Inline-Host-Formulare übernehmen die Vorgabe nur, solange keine individuelle Wahl vorliegt. Bereits explizit gespeicherte Zertifikatsprofile behalten Vorrang. Bei älteren Zertifikaten ohne Profilfeld wird die aktuelle globale Wahl während der nächsten Erneuerung angewendet.

Die globale Vorgabe stammt ausschließlich aus der Datenbank und beginnt mit Standard. Bei jedem Standard-Auftrag werden erforderliche und bevorzugte Certbot-Profile geleert, damit alte INI- oder Lineage-Optionen nicht weiterwirken. Beide Auswahlen benötigen Certbot ab Version 4.0. Details zur Argumentauflösung und Erneuerung stehen unter [Certbot](../module/certbot.md).

Regressionen: `backend/test/internal/acme-profile.spec.js` prüft Auflösung, Berechtigungen, Client-/CA-Prüfung und Fehlererhalt; `backend/test/schema/acme-profile-settings-contract.spec.js` den API-Vertrag und `backend/test/migrations/acme-profile-setting.spec.js` die Standard-Vorgabe und Normalisierung bei erhaltenen individuellen Einstellungen. Die Client- und ACME-Aufrufe sind gemockt; es werden keine echten Zertifikate ausgestellt. `Settings/Certificates.test.tsx`, `Settings/Layout.test.tsx`, `useAcmeProfile.test.tsx` und `CertificateProfiles.test.tsx` prüfen UI-Zustände, sofortige Cacheübernahme sowie den Schutz individueller Profilwahlen vor verspäteten Antworten.

## Zertifikats- und Netzwerkoptionen

Einstellungen → Zertifikate / ACME ergänzt die Profilwahl um Schlüsseltyp und Prüfintervall. Einstellungen → Netzwerk bietet den automatischen Cloudflare-IP-Abruf und sein Aktualisierungsintervall an. Die Werte liegen in `setting.meta` der Datensätze `certificate-options` und `ip-ranges-options`; `value` ist jeweils `configured`.

| Datensatz             | Metadaten                                                                          | Vorgabe                |
| --------------------- | ---------------------------------------------------------------------------------- | ---------------------- |
| `certificate-options` | `key_type`: `ecdsa` oder `rsa`, `renewal_interval_hours`: ganze Zahl 1–12          | ECDSA, 12 Stunden      |
| `ip-ranges-options`   | `enabled`: Boolean, `refresh_interval_hours`: ganze Zahl 6–594 und durch 6 teilbar | deaktiviert, 6 Stunden |

`GET` und `PUT /api/settings/certificate-options` beziehungsweise `/api/settings/ip-ranges-options` verwenden direkt das jeweilige Optionsobjekt als Antwort und vollständigen PUT-Body, ohne `value`-/`meta`-Hülle. GET verlangt `settings:get`, PUT `settings:update` für die jeweilige ID. Die generische Settings-Aktualisierung dieser Datensätze wird abgewiesen; die dedizierten Services validieren und wenden die Werte an.

Zertifikatsänderungen benötigen keinen Neustart: Das Prüfintervall ersetzt den bestehenden Timer ohne zusätzliche Sofortprüfung, der Schlüsseltyp gilt für die nächste Ausstellung oder Erneuerung einschließlich bestehender Lineages. Ein Timerwechsel erzwingt keine Erneuerung. Eine schon laufende automatische Prüfserie verwendet weiterhin ihren anfangs geladenen Schlüsseltyp; die Änderung gilt ab der nächsten Serie. Bei IP-Ranges startet Aktivieren einen Hintergrundabruf und den Timer; reine Intervalländerungen ersetzen nur den Timer. Deaktivieren stoppt zukünftige Abrufe und macht laufende Antworten für die Veröffentlichung ungültig. Die zuletzt gespeicherte Range-Liste bleibt erhalten.

GitOps-Restore leitet diese beiden Optionsdatensätze ebenfalls durch dieselben Schema- und Serviceprüfungen samt Live-Anwendung. Importierte Werte müssen `value: "configured"` und vollständige gültige Metadaten verwenden. Ungültige Daten werden als Importfehler gemeldet und ersetzen die vorhandenen Optionen nicht. Regressionen prüfen Migration, API-Vertrag, Berechtigungen und Timer-Anwendung unter `backend/test/migrations/application-options.spec.js`, `backend/test/schema/application-options-contract.spec.js`, `backend/test/routes/application-options.spec.js` und den beiden `internal/*-options.spec.js`-Dateien; die UI-Zustände unter `Settings/RuntimeOptions.test.tsx`.

Die Migration `20260930000200_add_application_options.js` importiert die bisherigen `ACME_KEY_TYPE`-, `CRT`-, `SKIP_IP_RANGES`- und `IPRT`-Werte nur bei der ersten Anlage fehlender Datensätze. Vorhandene Datenbankwerte bleiben erhalten. Danach gibt es keine Umgebungsrückfallebene für diese Optionen. Die verbleibenden Konfigurationsgruppen und die geplante Reihenfolge ihrer Verlagerung stehen unter [Konfigurationsstrategie](../konfiguration/config-dateien.md#schrittweise-verlagerung-von-anwendungsoptionen).

## Standardseite und Fehlerbehandlung

Partielle Settings-Updates verändern nur die tatsächlich mitgesendeten Felder `value` und `meta`. Ausgelassene Felder bleiben aus dem gespeicherten Datensatz erhalten, auch bei der anschließenden Nginx- und HTML-Erzeugung. Ein reines HTML-Metadaten-Update behält daher den bisherigen Seitenmodus; ein Wechsel des Modus auf `html` kann vorhandene HTML-Metadaten weiterverwenden. Ein mitgesendetes `meta` ersetzt weiterhin das gesamte Metadatenobjekt.

Änderungen an `default-site` laufen unter derselben Nginx-Konfigurationssperre wie Hoständerungen. Die bestehende Konfiguration und bei HTML-Änderungen der bisherige Seiteninhalt werden vor der Ersetzung gesichert. Erst nach erfolgreicher Generierung und Prüfung werden die Datenbankänderung und der Reload durchgeführt; bei einem Fehler werden die Datenbanktransaktion, Konfiguration und HTML zurückgesetzt und die bisherige Konfiguration erneut geladen. Scheitert auch diese Wiederherstellung, bleibt der Fehler sichtbar und muss anhand der Serverprotokolle geprüft werden.

Beim Start wird die vollständige gespeicherte Einstellung einschließlich `value` und `meta` geladen. Die Option `REGENERATE_ALL` verwendet für 404-Hosts deren eigene Vorlage und deren Konfigurationsverzeichnis. Regressionstests: `backend/test/internal/setting-rollback.spec.js` und `backend/test/internal/setup-state.spec.js`.

## Abhängigkeiten

- Objection.js-Modell `setting.js`
- `internal/audit-log.js` — Protokollierung
- Wird von `internal/nginx.js`, `internal/ai.js`, `internal/gitops.js`, `internal/anubis.js` u. a. gelesen

## Hinweis

Dashboard-Notizen sind ein eigenständiges Feature und werden auf einer separaten Seite dokumentiert: [Dashboard-Notizen](../module/dashboard-notes.md).

## Verwandte Seiten

- [Verwaltungsübersicht](./README.md)
- [Dashboard-Notizen](../module/dashboard-notes.md)
- [Audit-Log](./audit-log.md)
- [Modulübersicht](../module/README.md)
- [Zertifikate](../module/zertifikate.md)
