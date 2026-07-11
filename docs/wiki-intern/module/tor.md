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

Beim Anlegen oder Aktualisieren eines Onion-Service wird automatisch die Funktion `syncProxyHost()` aufgerufen (Zeile 137 in `tor.js`):

```javascript
const syncProxyHost = async (service, skip_reload = false) => {
  if (!service.proxy_host_id || !service.onion_address) return;

  // Lädt den zugehörigen Proxy-Host aus der DB
  const proxyHost = await ProxyHost.query()
    .findById(service.proxy_host_id)
    .where("is_deleted", 0);

  // Prüft ob Onion-Adresse bereits in domain_names
  if (!proxyHost.domain_names.includes(service.onion_address)) {
    // Fügt Onion-Adresse hinzu
    const newDomains = [...proxyHost.domain_names, service.onion_address];
    await ProxyHost.query().patchAndFetchById(proxyHost.id, {
      domain_names: newDomains,
    });

    // Rekonfiguriert Nginx mit neuem Domain-Satz
    const updatedHost = await ProxyHost.query().findById(proxyHost.id);
    await internalNginx.configure(ProxyHost, "proxy_host", updatedHost, {
      skip_reload,
    });

    logger.info(
      `Added onion address ${service.onion_address} to Proxy Host ${proxyHost.id}`,
    );
    internalGitOps.triggerAutoPush("onion-sync");
  }
};
```

**Wichtig:** Die `.onion`-Adresse wird automatisch in die `domain_names` des zugehörigen Proxy-Hosts aufgenommen. Dadurch muss der Benutzer die Onion-Adresse nicht manuell eintragen — Nginx wird automatisch mit dem korrekten Domain-Set konfiguriert.

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Modulübersicht](./README.md)
- [Proxy-Host](./proxy-host.md)
- [Cloudflare Tunnels](./cloudflared.md)
- [WireGuard](./wireguard.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
