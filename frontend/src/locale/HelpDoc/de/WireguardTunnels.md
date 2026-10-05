## WireGuard-Tunnel

WireGuard verbindet ein Gerät über einen verschlüsselten VPN-Tunnel mit deinem Server. Jeder Peer erhält eine eigene Tunneladresse und eine Clientkonfiguration.

1. Lege in den **WireGuard-Einstellungen** den Serverendpunkt, UDP-Port, das IPv4-`/24`-Subnetz und die Serveradresse fest. Die Serveradresse muss zum Subnetz gehören. Endpunkt und UDP-Port müssen für den Client erreichbar sein.
2. Wähle **Peer hinzufügen**, gib einen Namen ein und speichere. **Erlaubte IPs** verwendet zunächst das aktuelle Server-Subnetz, beispielsweise `10.8.0.0/24`. Eine eigene Eingabe bleibt erhalten. Bestehende Peers behalten ihre gespeicherten Routen.
3. Lade die Clientkonfiguration herunter, kopiere sie oder scanne ihren QR-Code im WireGuard-Client. Halte die Konfiguration geheim, da sie den privaten Schlüssel des Peers enthält.
4. Für einen Dienst auf diesem Gerät legst du einen Proxy-Host mit der vergebenen Tunnel-IP des Peers und dem Port des Dienstes an.

Das Formular für neue Peers wartet auf aktuelle Serverinformationen. Schlägt das Laden fehl, nutze **Aktualisieren**, bevor du speicherst.

## Routing und Zugriff

**Erlaubte IPs** bestimmt, welche Zielnetze der Client durch den Tunnel sendet. Das Feld begrenzt weder den Zugriff auf dem Server noch trennt es Peers voneinander. Eine Route für den gesamten Verkehr wie `0.0.0.0/0` benötigt zusätzlich passendes Routing und NAT auf dem Server. `::/0` richtet keinen IPv6-Tunnel ein.

Das Deaktivieren eines Peers stoppt dessen Tunnelzugriff. Nach dem erneuten Aktivieren kannst du dieselbe Peer-Konfiguration weiterverwenden.
