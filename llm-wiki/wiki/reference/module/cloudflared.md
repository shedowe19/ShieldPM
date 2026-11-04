# Cloudflare Tunnels

## Zweck

Integration von Cloudflare Tunnels (cloudflared) für Zero-Trust-Zugriff ohne offene Ports.

## Kontext

Ermöglicht das Exponieren von Diensten über Cloudflare ohne eingehende Portfreigaben im Router.

## Wichtige Dateien

- `backend/internal/cloudflared.js` — Business-Logik
- `backend/models/cloudflared_tunnel.js` — Objection.js-Modell
- `backend/routes/nginx/cloudflared.js` — API-Routen
- `backend/lib/service-credentials.js` — öffentliche Antwort ohne Tunnel-Token
- `frontend/src/components/Nginx/CloudflaredTunnelModal.tsx` — Erstellen, Bearbeiten und generationsgebundener Speicherabschluss

## Verhalten

- Verwaltet Cloudflare-Tunnel-Konfigurationen in der Datenbank
- Startet und überwacht die lokal installierte Cloudflared-Binary
- Kein offener Port auf dem Host nötig
- Die Online-Anzeige besagt, dass der lokale Prozess nach zwei Sekunden noch läuft; sie ist kein Nachweis, dass jeder Cloudflare-Public-Hostname oder der zugehörige Origin funktioniert.

## Abhängigkeiten

- Cloudflared-Binary (muss verfügbar sein)
- `internal/audit-log.js` — Protokollierung

### Prozesslebenszyklus

Das Modul startet die lokal installierte `cloudflared`-Binary mit dem Tunnel-Token in der Prozessumgebung. Es registriert einen `error`-Handler für Startfehler, beispielsweise eine fehlende Binary, und speichert Fehlerstatus und Fehlermeldung. Ein verspätetes `exit`-Event eines gestoppten Prozesses darf weder den Eintrag eines bereits gestarteten Nachfolgers löschen noch dessen Status überschreiben. Auch die verzögerte Online-Prüfung bezieht sich auf die konkrete Prozessinstanz.

Der Token ist im Datenbankmodell verschlüsselt. GitOps exportiert jedoch den entschlüsselten Modelldatensatz nach `cloudflared-tunnels/*.yaml`; Zugriff auf das GitOps-Repository und dessen Sicherungen muss entsprechend beschränkt werden. Der Origin des Public Hostname wird im Cloudflare-Konto konfiguriert und muss auf einen erreichbaren ShieldPM-Listener zeigen; das Zielschema des Proxy Hosts beschreibt unabhängig davon die Verbindung zum Anwendung-Upstream.

### Serialisierung und globale Sichtbarkeit

Start, Stop, Restart und Löschen laufen pro Tunnel-ID nacheinander. Gleichzeitige Starts können dadurch keinen zweiten unverwalteten Prozess erzeugen. REST und KI verwenden denselben internen Löschweg; dessen Sperre umfasst Stop und Datenbanklöschung. Ein bereits eingereihter Restart kann deshalb erst nach Abschluss der Löschung fortfahren. Fehler asynchroner Start-/Restart-Aufträge werden ausdrücklich abgefangen und protokolliert.

Start und Restart laden innerhalb dieser Warteschlange den aktuellen, nicht gelöschten Datenbankeintrag. Ein alter Snapshot kann daher weder einen gelöschten Tunnel erneut starten noch nach einer Tokenrotation veraltete Zugangsdaten verwenden. Numerische und stringförmige IDs teilen dieselbe Warteschlange und Prozesszuordnung. `fifth-integrations-cloudflared-delete.spec.js` prüft entfernte und soft-gelöschte Einträge, Tokenrotation und einen während der verzögerten Datenbanklöschung eingereihten Restart.

Beim erfolgreichen GitOps-Import mit `overwrite` werden fehlende Tunnel zunächst in der Datenbank soft-gelöscht und anschließend über dieselbe Stop-Warteschlange mit `SIGTERM` beendet. Ein eingereihter Start findet damit keinen aktiven Datensatz mehr. Scheitert die Datenbanklöschung, wird der Prozess nicht gestoppt; scheitert Stop, meldet der Import einen Fehler und kann die bereits persistierte Soft-Löschung erneut bereinigen. Ein fehlendes Modulverzeichnis, ein Import ohne `overwrite` und unverändert importierte Tunnel lösen keinen Stop aus. `gitops-cloudflared-prune.spec.js` prüft diese Verträge mit der vollständigen SQLite-Migrationskette, echten Modellen und Services sowie einem simulierten Child-Prozess ohne Cloudflare-Netzwerkzugriff.

Ändern und Löschen beachten die von der jeweiligen Capability gelieferte `permission_visibility`: `all` erlaubt fremde Tunnel, eingeschränkte Sichtbarkeit begrenzt auf den Eigentümer. Globale Verwaltungsrechte werden nicht durch eine zusätzliche pauschale Owner-Prüfung blockiert.

### Zugangsdaten in API und Dialog

Listen-, Detail-, Erstellungs- und Änderungsantworten enthalten keinen `token`. Das öffentliche Feld `has_token` meldet lediglich, ob ein Token hinterlegt ist; dies gilt auch bei globaler Sichtbarkeit und für verwaltende Benutzer. Die Berechtigungs- und Eigentümerprüfung bleibt bestehen. Prozesssteuerung und GitOps verwenden weiterhin die tatsächlichen gespeicherten Zugangsdaten innerhalb des Backends.

Beim Ändern entfernt die Route ausgelassene oder leere Tokenwerte aus dem Datenbank-Patch. Eine Umbenennung schreibt dadurch keinen früher gelesenen Token zurück und erhält auch einen inzwischen rotierten Wert. Ein ausdrücklich übermittelter nicht leerer Token ersetzt den gespeicherten Wert. Im Bearbeitungsdialog bleibt das Passwortfeld leer und zeigt bei `has_token` einen Hinweis zum Beibehalten. Für einen neuen Tunnel oder einen Eintrag ohne hinterlegten Token verlangt der Dialog eine Eingabe.

Der Dialog bindet Speicherantworten an die aktuelle Öffnung und Tunnel-ID. Eine verspätete Antwort darf einen inzwischen erneut geöffneten Entwurf nicht schließen; ein erneuter Objekt-Snapshot derselben ID setzt den geöffneten Entwurf nicht zurück. `backend/test/routes/service-credentials.spec.js` prüft öffentliche Antworten, Berechtigungsgrenzen und erhaltene Tokens. `frontend/src/components/Nginx/CloudflaredTunnelModal.credentials.test.tsx` prüft die leere Secret-Eingabe beim Umbenennen, die Pflichtangabe bei Erstellung, stabile Entwürfe sowie verspätete Antworten nach erneutem Öffnen oder Unmount.

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Modulübersicht](./README.md)
- [Proxy-Host](./proxy-host.md)
- [IP-Ranges (Cloudflare-IPs)](./ip-ranges.md)
- [Tor Onion Services](./tor.md)
- [WireGuard](./wireguard.md)
