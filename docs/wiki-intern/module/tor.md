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
- Schreibt Hidden-Service-Konfiguration nach `/data/tor/`
- Liest `hostname`-Datei, um die Onion-Adresse anzuzeigen
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

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Modulübersicht](./README.md)
- [Proxy-Host](./proxy-host.md)
- [Cloudflare Tunnels](./cloudflared.md)
- [WireGuard](./wireguard.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
