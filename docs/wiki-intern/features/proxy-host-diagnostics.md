# Proxy-Host-Diagnose

## Zweck

Die Diagnose untersucht auf Knopfdruck einen einzelnen Proxy-Host und zeigt die Schritte DNS, TLS, lokale Nginx-Route, Upstream, Zugriffsschutz und WebSocket in dieser Reihenfolge. Die Ergebnisse sind Momentaufnahmen und werden nicht gespeichert.

## Kontext

Die Oberfläche öffnet den Diagnose-Dialog aus der Proxy-Host-Liste. `POST /api/nginx/proxy-hosts/:host_id/diagnostics` verlangt eine aktive Sitzung und dieselbe `proxy_hosts:get`-Prüfung einschließlich Owner-Sichtbarkeit wie der Abruf des Host-Datensatzes. Der Body erlaubt ausschließlich `websocket_path` als optionalen relativen Pfad; Standard ist `/`. Host-ID und gespeicherte Host-Konfiguration bestimmen Hostname und Port aller Prüfziele. Ein Pfad ist auf 256 ASCII-Zeichen begrenzt; URL, Query, Fragment, Steuerzeichen, kodierte Ausnahmen und Punktsegmente sind unzulässig.

## Wichtige Dateien

- `backend/internal/proxy-host-diagnostics.js` – begrenzte Netzwerkprüfungen und feste Ergebnis-Codes
- `backend/routes/nginx/proxy_hosts.js` – autorisierte, ratenbegrenzte API-Route
- `backend/schema/paths/nginx/proxy-hosts/hostID/diagnostics/post.json` – OpenAPI-Vertrag
- `frontend/src/pages/Nginx/ProxyHosts/ProxyHostDiagnosticsDialog.tsx` – Ergebnisdialog
- `frontend/src/api/backend/diagnoseProxyHost.ts` und `frontend/src/hooks/useProxyHostDiagnostics.ts` – Client und Mutation

## Verhalten

1. DNS löst für den ersten exakt benannten Host A und AAAA auf und zeigt nur die Anzahl der Antworten. Ein reiner Wildcard-Host lässt diesen Schritt aus.
2. TLS verbindet sich mit dem lokalen Nginx-HTTPS-Listener und SNI des Hosts. Es prüft Zertifikat, Namen, Laufzeit und Vertrauenskette; ein eigenes oder intern signiertes Zertifikat führt zu einer Warnung bei fehlendem Systemvertrauen.
3. Die lokale Route sendet `HEAD /` an den eigenen Nginx-Listener mit dem gespeicherten Hostnamen. HTTP-Weiterleitungen und 401/403 werden ohne Weiterleitung oder Anmeldung erfasst. Bei deaktiviertem HTTP und ohne Zertifikat verwendet die Route den zugehörigen lokalen Unix-Socket.
4. Der Upstream-Schritt prüft ausschließlich die TCP-Verbindung zum hinterlegten Host/Port bei HTTP(S) oder gRPC(S). Er prüft weder Anwendungsantwort noch TLS-Vertrauen des Upstreams.
5. Die Auth-Prüfung ordnet die Antwort des unauthentifizierten Route-Checks ein. 30x oder 401/403 können erwartete Schutzreaktionen sein; 2xx bei konfigurierter Zugriffsliste ist **nicht eindeutig prüfbar**, weil Regeln lokale Requests erlauben können. Dies wird als übersprungene, nicht als fehlerhafte Schutzprüfung angezeigt.
6. Ein konfigurierter WebSocket-Host bekommt eine unauthentifizierte Upgrade-Anfrage an den angegebenen Pfad desselben Hosts (Standard `/`, z. B. `/api/ws`). 101 bestätigt den Handshake an diesem Pfad; eine Auth-Weiterleitung oder 401/403 bleibt als geschützter Endpunkt gekennzeichnet. Andere Pfade werden nicht verifiziert.

Alle Netzwerkversuche haben je drei Sekunden Timeout; die Route ist zusätzlich auf sechs Aufrufe pro Minute und IP begrenzt. Es werden keine Redirects verfolgt, Antwortinhalte gelesen oder Cookies, Tokens und Zugangsdaten mitgesendet. DNS-/Socket-/TLS-Rohfehler und Zertifikatdaten gelangen nicht in die API-Antwort; die Texte werden über feste `message`-Codes übersetzt. Bei `LISTEN_PROXY_PROTOCOL=true` werden lokale Route, TLS und WebSocket ausdrücklich ausgelassen, weil ein normaler Browser-Request ohne PROXY-Präfix nicht repräsentativ wäre. Deaktivierte Hosts werden nicht über die lokale Route geprüft.

## Abhängigkeiten

- `internal/proxy-host.js` – Host-Zugriff und Sichtbarkeit
- Node.js `dns`, `net`, `tls`, `http` und `https` – kurzlebige Prüfungen ohne neue Paketabhängigkeit

## Offene Fragen

- Ein öffentliches CDN, NAT, Split-DNS oder externer Load Balancer liegt außerhalb der lokalen Nginx-Routenprüfung; dessen Erreichbarkeit muss getrennt geprüft werden.
- Ein 101-Handshake weist auf erfolgreiche Erreichbarkeit an diesem Pfad hin, ist aber kein Ersatz für eine angemeldete Anwendungssitzung mit erneuter Verbindung.

## Verwandte Seiten

- [Proxy-Host](../module/proxy-host.md)
- [API-Routen](../api/routen.md)
- [Nginx-Engine](../module/nginx-engine.md)
