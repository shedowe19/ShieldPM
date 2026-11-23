# SCC- und TIA-Prüfliste

**Status:** Entwurf. Nur ausfüllen, wenn tatsächlich personenbezogene Daten in ein Drittland übermittelt werden.

## 1. Übermittlung erfassen

| Frage | Antwort |
|---|---|
| Welcher Dienst? | z. B. Google Gemini, Gravatar, GitHub, E-Mail-Provider |
| Welche Daten? | Datenkategorien, Betroffene, Mengen |
| Zweck? | KI-Antworten, Avatar, Updates, Benachrichtigungen |
| Rolle des Anbieters? | Auftragsverarbeiter, eigenständiger Verantwortlicher, gemeinsame Verantwortlichkeit |
| Sitz und Empfänger? | Land, Konzern, Unterauftragnehmer |
| Übermittlungsweg? | API, Webhook, Download, E-Mail |
| Rechtsgrundlage? | Art. 6 Abs. 1 lit. b/f, Art. 49 nur im Ausnahmefall |

## 2. Angemessenheitsbeschluss prüfen

- Liegt für das Empfängerland ein gültiger Angemessenheitsbeschluss der EU-Kommission vor?
- Falls nein: Werden die aktuellen Standardvertragsklauseln (SCC) verwendet?
- Welche SCC-Module sind einschlägig (C2P, C2C, P2P, P2C)?
- Sind die SCC Bestandteil des Vertrags und nicht nur verlinkt?

## 3. Transfer Impact Assessment (TIA)

| Prüfpunkt | Bewertung |
|---|---|
| Gesetze und Praxis im Empfängerland | Zugriffsbefugnisse, Vorratsdatenspeicherung, Geheimdienstrecht |
| Wahrscheinlichkeit und Schwere eines Zugriffs | konkrete Daten, Verschlüsselung, Anonymisierung |
| Ergänzende Maßnahmen | Ende-zu-Ende-Verschlüsselung, Pseudonymisierung, Schlüsselverwahrung in der EU, Datenminimierung |
| Restrisiko | niedrig / mittel / hoch, mit Begründung |
| Entscheidung | zulässig / nur mit Ergänzungen / nicht zulässig |

## 4. Anbieter-Mindestprüfung

- AVV und SCC liegen unterschrieben vor.
- Unterauftragsnehmer sind benannt und genehmigt.
- Datenminimierung ist technisch erzwungen (nur notwendige Felder).
- Löschfristen und Exportmöglichkeiten sind dokumentiert.
- Sicherheitsvorfälle werden innerhalb der vertraglichen Frist gemeldet.
- Der Anbieter ist nicht alleiniger Empfänger von Schlüsseln, die die Daten entschlüsseln.

## 5. Bekannte Dienste in ShieldPM

| Dienst | Standard | Daten | Maßnahme |
|---|---|---|---|
| Google Gemini | optional | Prompt, Tool-Ergebnisse, ggf. Host-/Logdaten | AVV/SCC/TIA vor Aktivierung; Datenminimierung; kein Training |
| Gravatar | optional | E-Mail-Hash | Deaktivieren oder lokale Avatare verwenden |
| GitHub | Release/Update | technische Metadaten, keine Instanzdaten | Standard-Updatequelle; Integrität per Signatur prüfen |
| E-Mail-/Webhook-Ziele | optional | Benachrichtigungsinhalte | Betreiber wählt Ziel und verantwortet Transfer |

## 6. Ergebnis

- [ ] Keine Drittlandübermittlung
- [ ] Übermittlung mit Angemessenheitsbeschluss
- [ ] Übermittlung mit SCC und positivem TIA
- [ ] Übermittlung unzulässig; Dienst deaktivieren

**Geprüft von / Datum:** ______________________
