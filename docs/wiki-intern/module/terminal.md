# Terminal (SSH)

## Zweck

Das Terminal-Scheme verbindet einen authentifizierten Browser über Nginx und einen Backend-WebSocket mit einem
festgelegten SSH-Ziel. Es ist nur für explizit gehärtete Proxy-Hosts aktiv.

## Aktivierungsbedingungen

`backend/internal/terminal.js` verweigert die Nutzung, wenn eine Bedingung fehlt:

- Zertifikat und erzwungenes HTTPS;
- authentifizierende Access List;
- gültiger SSH-Host-Key-Fingerprint (`SHA256:…` oder 64-stellig hex);
- Authority/Hostname passend zu den Domains des Proxy-Hosts;
- aktive, nicht gelöschte Host-/ACL-Konfiguration.

## Gateway und Ticket

Nginx erzeugt über das intern geteilte Secret eine HMAC-Signatur für Zeit, Host-ID, Authority, Browser-Fingerprint und
monotone ACL-Revision. Der Browser tauscht diese Assertion gegen ein zufälliges One-Time-Ticket mit 30 Sekunden TTL.
Maximal 1.000 ausstehende Tickets werden gehalten.

Der WebSocket überträgt `shieldpm-terminal`, `ticket.<wert>` und `fingerprint.<wert>` als Subprotokolle; das Ticket
steht nicht in URL oder Log. Der Backend-Upgrade prüft Pfad, HMAC, Zeitfenster und sämtliche Bindungen. Das Ticket wird
vor dem Ergebnis aus der Map entfernt, daher verbraucht auch ein falscher Binding-Versuch den Wert.

## SSH- und Laufzeitgrenzen

Vor Authentifizierung vergleicht `ssh2` den präsentierten Host-Key-Digest timing-safe mit dem gepinnten Fingerprint.
Eingabeframes sind auf 64 KiB begrenzt, JSON-/Resize-Werte werden typ- und bereichsgeprüft, Output wird mit
Backpressure behandelt. Host-/ACL-Änderung oder Löschung widerruft Tickets und beendet passende Sessions; Shutdown
beendet alle Sessions.

## Wichtige Dateien

- `backend/internal/terminal.js`
- `backend/routes/nginx/proxy_hosts.js`
- `backend/templates/_proxy_logic.conf`
- `backend/schema/components/proxy-host-object.json`
- `rootfs/html/terminal/index.html`
- `frontend/src/modals/ProxyHostTerminalFields.tsx`

## Sicherheitsbetrieb

Den Fingerprint aus einer unabhängigen, authentifizierten Quelle beziehen (Konsole/CMDB), nicht aus derselben
untrusted Erstverbindung. Terminal-Hosts nicht ohne TLS und restriktive Access List veröffentlichen. Das HMAC-Secret und
SSH-Credentials bleiben verschlüsselte/geschützte Serverwerte und gehören nie in GitOps.

## Verwandte Seiten

- [Proxy Host](./proxy-host.md)
- [Access Lists](./access-lists.md)
- [Nginx-Engine](./nginx-engine.md)
- [Security-Modernisierung](../entscheidungen/2026-08-31-security-modernisierung.md)
