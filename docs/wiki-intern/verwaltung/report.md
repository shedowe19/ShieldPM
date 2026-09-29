# System-Reports & Versionierung

## Zweck

Anzeige der Host-Anzahlen und Prüfung auf neue ShieldPM-Releases.

## Kontext

Der Host-Bericht speist das Dashboard; die Versionsprüfung fragt das aktuelle GitHub-Release des Projekts ab.

## Wichtige Dateien

- `backend/internal/report.js` — Host-Anzahlen unter Berücksichtigung von Benutzer-ID und Sichtbarkeitsrechten
- `backend/internal/remote-version.js` — Release-Abfrage und SemVer-Vergleich

## Verhalten

- `report.js` liefert die vier Zähler `proxy`, `redirection`, `stream` und `dead`; Zertifikate und Benutzer gehören nicht zu diesem Bericht. Die Abfrage benötigt `reports:hosts`.
- `remote-version.js` fragt `https://api.github.com/repos/shedowe19/ShieldPM/releases/latest` ab und vergleicht `tag_name` per SemVer mit `backend/package.json`. Es cached ein gültiges Ergebnis 24 Stunden im Backend-Prozess und begrenzt den HTTP-Abruf auf zehn Sekunden und 1 MiB. Die Rückgabe enthält `current`, `latest` und `update_available`.

## Abhängigkeiten

- Node.js `https` Modul + `ProxyAgent` (für Remote-Requests, siehe `remote-version.js` für Details)

## Verwandte Seiten

- [Verwaltungsübersicht](./README.md)
