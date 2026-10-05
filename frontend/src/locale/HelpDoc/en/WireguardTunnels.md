## WireGuard Tunnels

WireGuard connects a device to your server through an encrypted VPN tunnel. Each peer receives its own tunnel address and client configuration.

1. Configure the server endpoint, UDP listen port, IPv4 `/24` subnet and server address in **WireGuard Settings**. The server address must belong to the subnet. Make the endpoint and UDP port reachable before connecting a client.
2. Choose **Add Peer**, enter a name and save. **Allowed IPs** starts with the current server subnet, for example `10.8.0.0/24`. A value you enter yourself is retained. Existing peers keep their saved routes.
3. Download the client configuration, copy it or scan its QR code in the WireGuard client. Keep the configuration private because it contains the peer's private key.
4. To proxy a service on that device, create a proxy host using the peer's assigned tunnel IP and the service's port.

The new-peer form waits for current server information. If loading fails, use **Refresh** before saving.

## Routing and access

**Allowed IPs** controls which destination networks the client sends through the tunnel. It does not restrict access on the server or isolate peers. A full-tunnel route such as `0.0.0.0/0` also requires suitable server routing and NAT; adding `::/0` does not configure an IPv6 tunnel.

Disabling a peer stops its tunnel access. Re-enable it to use the same peer configuration again.
