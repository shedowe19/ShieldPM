# Tor Onion Services

ShieldPM can publish a local TCP service through a Tor v3 `.onion` address without an inbound public port. Visitors need Tor Browser or another Tor client. The feature uses the local Tor daemon's authenticated control port to create and manage detached onion services.

## Prerequisites

- Tor must be available on the ShieldPM instance. `TOR_ENABLED=true` is the default; the Docker startup scripts configure the local control port and start the daemon when enabled.
- The service you publish must accept traffic on `127.0.0.1` at the **Target Port** from the ShieldPM/Tor network namespace. With the included Docker Compose host network, a host-local service is reachable there. For custom container networking, check that the target is actually reachable at that loopback address.
- To associate the onion address with an existing Proxy Host, you also need permission to update that host.

## Create a service

1. Go to **Hosts → Tor Onion** and choose **Add Onion Service**.
2. Enter a name, **Virtual Port** (on the onion address, default `80`), and **Target Port** (the local service port). You can optionally associate an existing Proxy Host.
3. Save. ShieldPM asks Tor to generate an ED25519 v3 identity, stores the resulting onion address and encrypted private key, and starts the service.

For example, to publish the HTTP listener of ShieldPM's included host-network installation, use virtual port `80` and target port `80`. When a Proxy Host is associated, ShieldPM also adds the generated onion address to that host's domain list and regenerates its Nginx configuration. The associated host must still have an appropriate local HTTP listener and routing configuration.

The service list shows the assigned onion address, port mapping and state (**stopped**, **starting**, **running**, or **error**). You can edit the service's name, associated Proxy Host and ports. Reassigning it moves the onion domain between authorized Proxy Hosts; changing ports restarts the Tor service. A Proxy Host must retain at least one domain when an onion address is removed. Access to a service and its linked host follows the corresponding management permissions and owner visibility.

Tor's control port is `127.0.0.1:9051`; it is not an externally published listener. The control password is generated at startup and kept under `/data/shieldpm/tor-control-password`. The Tor state directory and log are `/data/tor/` and `/data/tor/tor.log`. The private service identity is encrypted in the ShieldPM database using the instance's persistent encryption key. Back up **both** `/data` and the database when migrating instances so the onion identity can be recovered.

The Docker startup script writes `/etc/tor/torrc` from its template when Tor is enabled. It binds the control port to loopback, disables the SOCKS proxy, and logs to `/data/tor/tor.log`. On a native/LXC installation, check the Tor service and its configuration there instead of assuming the container startup script runs.

## Start, stop, and delete

- **Stop** removes the active Tor service while retaining its saved identity, so starting it again can restore the same address.
- **Delete** stops and removes the service record. Without a backup of its identity, that address cannot be recreated.
- When Tor is unavailable or a control command fails, inspect service status and the Tor log; a failed operation is reported instead of silently treating it as started or stopped.

In Demo Mode, the page explains that changes are disabled. Read requests may still return service and Tor availability information; write requests return HTTP 403.

## HTTP and HTTPS

An onion address authenticates its service within Tor and encrypts the Tor connection. HTTP on a virtual port such as 80 can therefore be appropriate for an onion-only service. HTTPS may still be needed for application behavior or for the transport between Tor's local target and a separate backend; configure the target listener and certificate accordingly. Normal browser certificate checks apply if you use HTTPS.

## Troubleshooting

```bash
# Docker; use pgrep tor directly on Native/LXC
docker exec shieldpm pgrep tor
docker exec shieldpm tail -n 80 /data/tor/tor.log
```

Allow time for Tor to establish circuits after creating a service, verify the full `.onion` address, and confirm that a service accepts connections on the configured target port. Do not print or share the Tor control password or private service key when collecting logs.

## Related pages

- [Proxy Hosts](./Proxy-Hosts.md)
- [Cloudflare Tunnels](./Cloudflared-Tunnels.md)
- [WireGuard Tunnels](./WireGuard-Tunnels.md)
