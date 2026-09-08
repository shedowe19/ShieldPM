# Tor Onion Services

## Zweck

Bereitstellung von Diensten über das Tor-Netzwerk als Hidden Services.

## Kontext

Ermöglicht Zugriff auf Proxy-Hosts über `.onion`-Adressen. Nützlich für Privatsphäre und CGNAT-Bypass.

## Wichtige Dateien

- `backend/internal/tor.js` (11 KB) — Business-Logik
- `backend/models/tor_onion.js` (3 KB) — Objection.js-Modell
- `backend/routes/nginx/tor_onion.js` (8 KB) — API-Routen
- `frontend/src/pages/Nginx/TorOnionServices.tsx` — Verwaltungsansicht für Onion-Dienste

## Verhalten

- Steuert den Tor-Prozess über `tor-control-port`
- Erzeugt laufende Onion-Dienste über `ADD_ONION` und stoppt sie über `DEL_ONION`
- Speichert Onion-Adresse und verschlüsselten privaten Service-Schlüssel in der Datenbank
- Aktivierung über Umgebungsvariable `TOR_ENABLED`
- Die Icon-Aktionen für Aktualisieren, Hilfe, Adresse kopieren, Starten/Stoppen, Bearbeiten und Löschen haben
  lokalisierte zugängliche Namen. `TorOnionServices.test.tsx` prüft diese Namen mit der deutschen Locale.

## Abhängigkeiten

- Tor-Daemon (muss installiert sein)
- `internal/nginx.js` — Config-Generierung

## syncProxyHost() — Automatische Proxy-Host-Synchronisation

Beim Erstellen oder Starten eines Onion-Service lädt `syncProxyHost()` den verknüpften Proxy-Host einschließlich `host_domains`. Fehlt die Onion-Adresse, wird sie als neues Kindobjekt der Relation eingefügt. Anschließend werden Domains, Zertifikat und vollständige Access List erneut geladen und Nginx konfiguriert. Beim Initialisieren kann der Reload bis zum Ende der Sammelverarbeitung ausgesetzt werden.

### Validierung und Geheimnisse

Virtueller und Zielport müssen vollständig ganzzahlige Werte zwischen 1 und 65535 sein. Teilweise numerische Strings mit zusätzlichen Tor-Control-Befehlen werden vor der Verbindung abgewiesen. Beim Stoppen wird die vollständige Onion-Adresse geprüft. Antworten auf `ADD_ONION`, die private Schlüssel enthalten können, werden nicht vollständig protokolliert.

### Berechtigungen und verlässliches Stoppen

Das Verknüpfen eines Onion-Service setzt zusätzlich die Änderungsberechtigung für den betroffenen Proxy-Host voraus. Eingeschränkte Sichtbarkeit begrenzt diese Verknüpfung auf eigene Hosts. Die eingebettete Proxy-Host-Relation in API-Antworten enthält nur die ID und Domains, keine SSH-, Git- oder sonstigen privaten Host-Felder.

Stop gilt nur bei bestätigtem `DEL_ONION` oder einem bereits nicht vorhandenen Service als erfolgreich. Andere ControlPort-Fehler erzeugen Fehlerstatus und verhindern, dass Delete oder Restart dennoch Erfolg melden. Insbesondere bleibt der Datenbankeintrag bei fehlgeschlagenem Stop erhalten. REST-Mutationen beachten die globale Sichtbarkeit `all` ebenso wie den Owner-Scope eingeschränkter Berechtigungen.

### Wechsel des verknüpften Proxy-Hosts

REST und KI verwenden denselben internen Update-Service. Er prüft den Zugriff auf bisherigen und neuen Host, verschiebt die Onion-Domain zusammen mit der Service-Zuordnung in einer Datenbanktransaktion und behält Sicherungen beider Nginx-Dateien bis zum Commit. Bei einem Fehler werden Datenbank und vorherige Dateien wiederhergestellt. Der bisherige Host muss mindestens eine Domain behalten.

Ein verspätetes Tor-Start-Ergebnis lädt vor der Domain-Synchronisierung die aktuelle Service-Zuordnung erneut. So fügt es die Onion-Adresse nicht wieder einem inzwischen abgelösten Host hinzu.

### Öffentliche Antworten und verzögerte Folgearbeiten

REST-Antworten für Liste, Detail, Erstellung, Änderung, Start und Stop entfernen den privaten Onion-Schlüssel. Der Schlüssel bleibt intern für `ADD_ONION` verfügbar. Ein fehlgeschlagener Start ergibt einen Fehler und keinen Audit-Eintrag mit Status „started“.

Nach einer Host-Neuzuordnung wird auch der erste Aufruf der verzögerten Anubis-Policy-Erzeugung korrekt behandelt: `lodash.debounce` kann zunächst `undefined` zurückgeben. Dies darf eine bereits erfolgreich abgeschlossene Datenbank- und Nginx-Änderung nicht nachträglich als Fehler melden.

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Modulübersicht](./README.md)
- [Proxy-Host](./proxy-host.md)
- [Cloudflare Tunnels](./cloudflared.md)
- [WireGuard](./wireguard.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
