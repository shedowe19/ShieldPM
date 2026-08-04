# Host-Firewall-Policies

## Zweck

Host-Firewall-Policies schützen veröffentlichte **HTTP(S)-Proxy-Hosts** auf Nginx-Ebene. Sie kombinieren GeoIP-Länderregeln, manuelle IPv4-/IPv6-CIDRs und aktualisierbare TXT-/CIDR-Feeds. Eine Policy kann mehreren Proxy-Hosts zugeordnet werden.

Das Modul ist kein Ersatz für OPNsense, `nftables` oder eine Host-Firewall: Es filtert ausschließlich HTTP(S)-Anfragen, die einen ShieldPM-Proxy-Host erreichen. Streams sowie andere Dienste und Ports bleiben außerhalb seines Geltungsbereichs.

## Bedienung

1. Unter **Hosts → Host-Firewall-Regeln** eine Policy erstellen.
2. Optional GeoIP-Allowlist oder -Blocklist, vertraute/gesperrte CIDRs und HTTPS-Feeds definieren.
3. Die Policy im **Sicherheit**-Tab eines Proxy-Hosts zuweisen.
4. Der Button **Feeds aktualisieren** lädt Quellen sofort neu; zusätzlich erfolgt die Aktualisierung nach dem gespeicherten Intervall (1–168 Stunden, Standard 24 Stunden).

Der X4B-VPN-Preset verwendet:

```text
https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt
```

Er wird nur auf ausdrückliche Auswahl in eine Policy eingetragen; ShieldPM aktiviert keine externen Listen automatisch. Der Feed enthält IPv4. Manuelle Regeln und eigene Feeds können IPv4 und IPv6 enthalten.

## Regelpriorität

Für jede Anfrage gilt pro Policy diese feste Reihenfolge:

1. Die ACME-Challenge `/.well-known/acme-challenge/` bleibt erreichbar.
2. Eine passende **vertrauenswürdige CIDR** erlaubt die Anfrage und umgeht die Policy.
3. Eine manuelle Block-CIDR oder ein Feed-CIDR sperrt die Anfrage.
4. Die GeoIP-Regel wird ausgewertet.
5. Erst danach greifen vorhandene Schutzschichten wie CrowdSec, Anubis, mTLS, SSO und Access Lists.

Bei **deny** liefert ShieldPM eine eigene, nicht zwischenspeicherbare Sperrseite mit HTTP-Status `403` statt der Standard-Nginx-Seite. Die Seite verhandelt ihre Sprache anhand von `Accept-Language` und unterstützt dieselben 13 Sprachen wie die ShieldPM-Oberfläche: Bulgarisch, Deutsch, Englisch, Spanisch, Italienisch, Japanisch, Koreanisch, Niederländisch, Polnisch, Russisch, Slowakisch, Vietnamesisch und Chinesisch. Nicht unterstützte oder fehlerhafte Sprachpräferenzen fallen sicher auf Englisch zurück. Sie erläutert abhängig vom Treffer, ob die IP-Adresse oder das erkannte Land nicht zugelassen ist. Bei GeoIP-Treffern kennzeichnet ein sichtbarer Status die Ursache und zeigt den lokalisierten Ländernamen samt ISO-Code – zum Beispiel **„Vereinigtes Königreich (GB)“** – sowie die vom Proxy erkannte IP. Sie gibt weder den Namen der auslösenden Policy noch Feed-URLs oder CIDRs preis. Die Seite wird vor Authentifizierung und Upstream ausgegeben; der interne Seitenaufruf überspringt bewusst geerbte SSO-, CrowdSec- und Rate-Limit-Handler, damit kein Login-Dialog die Sperrursache verdeckt. Der Zugriff auf den Proxy-Host bleibt dabei blockiert.

Bei **drop** bleibt es bewusst bei Nginx-`444` (Verbindung ohne HTTP-Antwort), damit keine Informationen an den Client preisgegeben werden.

## GeoIP

Für Länderregeln muss das bestehende GeoIP2-Setup aktiviert sein:

```text
NGINX_LOAD_GEOIP2_MODULE=true
```

Außerdem muss eine GeoLite2-Country-MMDB unter `/data/nginx/GeoLite2-Country.mmdb` verfügbar sein. Ohne aktiviertes GeoIP bleibt die CIDR-Auswertung aktiv; die GeoIP-Teilregel wird bewusst nicht erzwungen, damit ein fehlendes Datenbank-Mount nicht alle Hosts unzugänglich macht.

Hinter Cloudflare müssen die Real-IP-Ranges aktiv sein (`SKIP_IP_RANGES=false`), damit Nginx die Besucher-IP statt einer Cloudflare-IP bewertet.

## Feed-Sicherheit und Aktualisierung

`backend/internal/firewall-policy.js` behandelt Feeds als nicht vertrauenswürdige Eingabe:

- nur HTTPS, ohne URL-Credentials und ohne benutzerdefinierte Ports;
- DNS-Auflösung vor dem Abruf; private, Loopback-, Link-local-, Multicast- und nicht-unicast Adressen werden abgelehnt;
- die aufgelöste öffentliche Adresse wird für die Anfrage fest gebunden;
- Redirects werden nicht gefolgt, Antwortgröße ist auf 5 MiB begrenzt, Timeout 20 Sekunden;
- CIDRs und Kommentare werden normalisiert; eine nicht-leere Antwort ohne gültigen CIDR ersetzt den letzten gültigen Feed nicht;
- ETag und Last-Modified vermeiden unnötige Downloads;
- Feed-Dateien und die zentrale Nginx-Konfiguration werden atomar geschrieben. Bei Abruffehlern bleibt die letzte gültige Version wirksam.

Die kompilierten Daten liegen unter `/data/nginx/firewall/`; die globale Nginx-Map liegt unter `/data/nginx/firewall.conf`. Diese Dateien werden von ShieldPM verwaltet und nicht manuell bearbeitet.

## Architektur

- `backend/models/firewall_policy.js` — Policy-Datenmodell
- `backend/internal/firewall-policy.js` — Validierung, Feed-Abruf, atomare Dateien, Nginx-Maps, Scheduler und Reload
- `backend/routes/nginx/firewall_policies.js` — `/api/nginx/firewall-policies`
- `backend/templates/proxy_host.conf` und `_proxy_logic.conf` — Access-Phase für Anubis- und Standard-Proxy-Hosts
- `rootfs/usr/local/bin/start.sh` — bindet `/data/nginx/firewall.conf` auf HTTP-Ebene ein
- `rootfs/usr/local/share/shieldpm/firewall_blocked_page.lua` — gemeinsame, gestaltete deny-Seite für alle Host-Policies
- `frontend/src/pages/Nginx/FirewallPolicies.tsx` — Verwaltung und Host-Auswahl

Die globale Konfiguration verwendet Nginx-`geo` und `map`. Große Listen werden dadurch einmal je Policy geladen, statt tausende Direktiven in jede Host-Konfiguration zu kopieren.

## Berechtigungen

Das Erstellen, Ändern, Löschen, Aktualisieren und Zuweisen einer Policy erfordert `settings:update` für `firewall-policies`. Damit kann eine URL-Quelle nicht von Benutzern mit ausschließlich Host-Rechten zur Abfrage interner Netze missbraucht werden.

## Verwandte Seiten

- [Proxy-Host](./proxy-host.md)
- [Access-Lists](./access-lists.md)
- [IP-Ranges](./ip-ranges.md)
- [Nginx-Engine](./nginx-engine.md)
