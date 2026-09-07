# Maintenance

## Zweck

Geplante Wartungsfenster und Fehlerseiten für Proxy-Hosts.

## Kontext

Ermöglicht es, Proxy-Hosts zeitgesteuert in den Wartungsmodus zu versetzen und benutzerdefinierte Fehlerseiten anzuzeigen.

## Wichtige Dateien

- `backend/internal/maintenance.js` (5 KB) — Business-Logik

## Verhalten

- Zeitgesteuerte Wartungsfenster (Start-/Endzeit)
- Benutzerdefinierte Maintenance-Pages
- Failure-Pages bei Backend-Ausfällen

## Abhängigkeiten

- `internal/nginx.js` — Config-Generierung für Maintenance-Mode

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Zeit- und Konfigurationsvertrag

Die API gibt Wartungstermine als ISO-Zeitpunkte mit Zeitzone aus. Formulare zeigen die lokale Browserzeit und senden beim Speichern wieder ISO-Zeitpunkte. Bestehende Datenbankwerte bleiben in der bisherigen Serverzeitzone gespeichert; ein unveränderter Bestandswert behält dadurch seinen bisherigen Ausführungszeitpunkt. Eine nachträgliche Änderung der Serverzeitzone erfordert weiterhin eine gesonderte Datenmigration.

Der Startzeitpunkt zählt einschließlich des exakten Grenzwerts. Ein bereits aktiver Wartungsmodus mit ausschließlich geplantem Ende bleibt bis dahin aktiv. Termine außerhalb des Node-Timerbereichs werden über den bestehenden 30-Sekunden-Poll erkannt, statt einen überlaufenden Sofort-Timer zu erzeugen. Mehrfache Initialisierung erzeugt keinen zweiten Poll.

Deaktivierte Hosts erhalten keine neue Nginx-Konfiguration. Bei aktiven Hosts werden Domains, Zertifikat und vollständige Access-List mit Benutzern/IP-Regeln geladen, bevor die Konfiguration neu erzeugt wird.

## Verwandte Seiten

- [Proxy-Host](./proxy-host.md)
- [Nginx-Engine](./nginx-engine.md)
- [Verwaltung](../verwaltung/README.md)
- [Modulübersicht](./README.md)
