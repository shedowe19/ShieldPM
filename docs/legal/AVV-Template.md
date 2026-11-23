# Auftragsverarbeitungsvertrag (AVV) – Vorlage

**Status:** Entwurf zur rechtlichen Prüfung und Unterschrift. Keine Rechtsberatung.

zwischen

**[VERANTWORTLICHER]** (nachfolgend „Verantwortlicher")
und
**[AUFTRAGSVERARBEITER]** (nachfolgend „Auftragsverarbeiter")

## 1. Gegenstand und Dauer

Der Auftragsverarbeiter betreibt für den Verantwortlichen die ShieldPM-Instanz **[INSTANZ/URL]**. Der Vertrag gilt ab **[DATUM]** für die Laufzeit des zugrunde liegenden Hauptvertrags und endet mit dessen Beendigung, spätestens mit Abschluss der Löschung nach Ziffer 10.

## 2. Art, Zweck und Umfang der Verarbeitung

- **Zweck:** Bereitstellung, Betrieb, Überwachung und Support der ShieldPM-Instanz.
- **Art:** Erheben, Speichern, Verändern, Auslesen, Übermitteln, Einschränken, Löschen.
- **Datenkategorien:** Zugangs- und Stammdaten (Name, E-Mail, Rolle), Authentifizierungsdaten (Passwort-Hash, 2FA-Geheimnisse, Sitzungsdaten), technische Verbindungsdaten (IP, User-Agent, Zeitstempel), Audit- und Konfigurationsdaten, Zertifikats- und Host-Metadaten, verschlüsselte Zugangsdaten zu Diensten, Support-Tickets.
- **Betroffene:** Beschäftigte, Kunden, Administratoren und sonstige Nutzer des Verantwortlichen.
- **Keine besonderen Kategorien** nach Art. 9 DSGVO, sofern nicht im Anhang ausdrücklich genannt.

## 3. Weisungsbindung

Der Auftragsverarbeiter verarbeitet personenbezogene Daten ausschließlich auf dokumentierte Weisung des Verantwortlichen, auch für Übermittlungen in Drittländer. Er informiert unverzüglich, wenn eine Weisung gegen die DSGVO oder andere Datenschutzvorschriften verstößt.

## 4. Vertraulichkeit und Zugriff

Der Auftragsverarbeiter verpflichtet alle mit der Verarbeitung befassten Personen zur Vertraulichkeit und gewährt Zugriff nur nach dem Need-to-know-Prinzip. Administratorenzugänge sind einzeln zuzuordnen, mit MFA zu schützen und bei Ausscheiden unverzüglich zu entziehen.

## 5. Technische und organisatorische Maßnahmen

Der Auftragsverarbeiter setzt mindestens die in **Anlage 1** beschriebenen Maßnahmen um und weist sie auf Anfrage nach. Dazu gehören insbesondere:

- Verschlüsselung transportierter Daten (TLS) und sensibler ruhender Daten (AES-256-GCM, Schlüssel außerhalb des Datenbackups);
- rollenbasierte Zugriffskontrolle, Audit-Logging, Sitzungswiderruf und 2FA für administrative Konten;
- Patch- und Schwachstellenmanagement, Digest-Pinning und signierte Release-Artefakte;
- verschlüsselte Instanzbackups, getrennte Schlüsselverwahrung und regelmäßige Restore-Tests;
- Protokollierung sicherheitsrelevanter Ereignisse, Aufbewahrung und Löschung nach **Anlage 2**.

## 6. Unterauftragsverarbeiter

Der Auftragsverarbeiter darf Unterauftragsverarbeiter nur mit vorheriger schriftlicher Zustimmung des Verantwortlichen einsetzen. Die Liste steht in **Anlage 3** und im Register `Subprocessors.md`. Änderungen werden mindestens 30 Tage vorher angekündigt; der Verantwortliche kann aus wichtigem Grund widersprechen. Der Auftragsverarbeiter legt dem Unterauftragsverarbeiter gleichwertige Pflichten auf.

## 7. Betroffenenrechte

Der Auftragsverarbeiter unterstützt den Verantwortlichen angemessen bei Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch. Er leitet Anfragen unverzüglich an den Verantwortlichen weiter und beantwortet sie nicht in eigenem Namen, sofern keine Weisung vorliegt. Das Verfahren steht im `DSAR-Runbook.md`.

## 8. Sicherheitsvorfälle

Der Auftragsverarbeiter meldet dem Verantwortlichen unverzüglich, spätestens innerhalb von **24 Stunden** nach Kenntnis, jeden Verdacht auf eine Verletzung des Schutzes personenbezogener Daten. Die Meldung enthält mindestens:

- Zeitpunkt und Dauer,
- betroffene Systeme, Datenkategorien und Betroffenenkreise,
- vermutete Ursache und Angriffsweg,
- ergriffene Sofortmaßnahmen und offene Risiken,
- Ansprechpartner und weitere Kommunikationskanäle.

Der Auftragsverarbeiter unterstützt die 72-Stunden-Meldung nach Art. 33 DSGVO und dokumentiert den Vorfall nachvollziehbar.

## 9. Audit und Nachweise

Der Verantwortliche darf die Einhaltung dieses Vertrags nach Ankündigung mit angemessener Frist prüfen, insbesondere durch Fragebögen, Vorlage von Zertifikaten, Auditberichten oder einen Vor-Ort-Termin. Der Auftragsverarbeiter stellt die für die Aufsichtsbehörde erforderlichen Nachweise bereit.

## 10. Löschung und Rückgabe

Nach Beendigung des Hauptvertrags löscht der Auftragsverarbeiter alle personenbezogenen Daten und Kopien, einschließlich Backups, innerhalb von **30 Tagen**, sofern keine gesetzliche Aufbewahrungspflicht besteht. Er bestätigt die Löschung schriftlich. Eine Rückgabe erfolgt in einem gängigen, maschinenlesbaren Format.

## 11. Haftung und Schlussbestimmungen

Es gilt die Haftungsregelung des Hauptvertrags, soweit gesetzlich zulässig. Änderungen bedürfen der Schriftform. Bei Widersprüchen zwischen diesem Vertrag und dem Hauptvertrag gehen die datenschutzrechtlichen Pflichten dieses Vertrags vor.

## Anlage 1 – Technische und organisatorische Maßnahmen

| Bereich | Maßnahme |
|---|---|
| Zugang | Individuelle Konten, MFA, Least Privilege, sofortiger Entzug bei Ausscheiden |
| Verschlüsselung | TLS 1.2/1.3, AES-256-GCM ruhend, Schlüssel nicht im Datenbackup |
| Protokollierung | Audit-Log mit IP, User-Agent, Sitzung, Request-ID; unveränderbare Senke empfohlen |
| Backup | Verschlüsselte Instanzarchive, getrennte Schlüssel, Restore-Test mindestens jährlich |
| Schwachstellen | Gepinnte Abhängigkeiten, signierte Images, Patch-Fenster, Advisory-Prozess |
| Entwicklung | Code Review, Security-Checks in CI, keine Secrets im Repository |
| Vorfallsreaktion | Runbook, Bereitschaft, 24-Stunden-Meldung an den Verantwortlichen |
| Löschung | Fristen nach Anlage 2, Nachweis der Löschung |

## Anlage 2 – Aufbewahrung und Löschung

Siehe `Retention-Plan.md`. Der Verantwortliche bestätigt die dort genannten Fristen oder trägt abweichende Fristen ein: **[ABWEICHUNGEN]**.

## Anlage 3 – Unterauftragsverarbeiter

Siehe `Subprocessors.md`. Für Drittlandtransfers gilt die SCC-/TIA-Prüfliste.

## Unterschriften

| Verantwortlicher | Auftragsverarbeiter |
|---|---|
| Ort, Datum: | Ort, Datum: |
| Name: | Name: |
| Funktion: | Funktion: |
| Unterschrift: | Unterschrift: |
