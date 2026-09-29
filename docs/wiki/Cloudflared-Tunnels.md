# Cloudflare Tunnels

ShieldPM can run a `cloudflared` connector from a tunnel token stored in the management UI. The connector opens outbound connections to Cloudflare, so the tunnel does not require an inbound port on your router. You still configure the public hostname and its local origin service in Cloudflare.

The ShieldPM runtime must have the connector binary at `/usr/local/bin/cloudflared` and outbound connectivity to Cloudflare. This path is fixed in the current process manager. For a Native/LXC installation, verify the binary is installed there before creating a tunnel.

## Create a tunnel

1. Create a token-managed `cloudflared` tunnel in your Cloudflare account and copy its connector token. Treat the token as a credential.
2. In ShieldPM, open **Cloudflare Tunnels**, choose **Add Tunnel**, enter a name and paste the token.
3. Save. ShieldPM launches `/usr/local/bin/cloudflared tunnel run` with `TUNNEL_TOKEN` in the child process environment. A running child is shown as online after a short stability check; that status alone does not verify each published hostname.

The token is encrypted in ShieldPM's database. Starting, stopping, restarting, or deleting a tunnel acts on its local child process and database record. Configure or remove the corresponding public hostname in Cloudflare separately.

If GitOps export is enabled, its `cloudflared-tunnels/*.yaml` entries contain decrypted token values. Keep the GitOps repository private and restrict backup access.

## Route a public hostname to a Proxy Host

For the included `compose.yaml`, ShieldPM uses host networking. In Cloudflare's public hostname settings, set the origin service to `http://localhost:80` for ShieldPM's HTTP listener, or choose the appropriate reachable host/address if your deployment differs. Then create a ShieldPM **Proxy Host** whose **Domain Names** include exactly that public hostname. Its **Forward Scheme/Host/Port** describe your **application**, such as `http`, `192.168.1.50`, and `8080`.

```text
Visitor → Cloudflare edge → cloudflared → ShieldPM HTTP/HTTPS listener → application upstream
```

Cloudflare's origin service URL selects the listener on ShieldPM. It does **not** determine the Proxy Host's forwarding scheme. If you choose `https://localhost:443` as the origin instead, the domain must have a suitable certificate on ShieldPM. Set origin SNI/hostname and certificate verification in Cloudflare to match that certificate; disabling origin verification is a separate trust decision and is not universally required.

ShieldPM's HTTP WAF, access lists, and other Proxy Host settings operate on the request at its Nginx listener. The tunnel does not pass the visitor's original TLS handshake directly to Nginx. A ShieldPM access list requiring a visitor client certificate at Nginx cannot verify that certificate through a normal Cloudflare HTTP(S) public hostname; enforce client-certificate policy at Cloudflare if needed. Also review the real-client-IP settings for your Cloudflare deployment before creating IP-based rules.

## Troubleshooting

- Check the token and outbound network connectivity when the local tunnel process cannot start. For Docker, inspect `docker logs shieldpm`.
- If the process is running but a hostname fails, check the Cloudflare public hostname's origin URL and confirm the matching ShieldPM Proxy Host is enabled and its upstream reachable.
- For HTTPS origins, check the certificate name, trust and SNI settings for the **Cloudflare-to-ShieldPM** connection. This is distinct from the Proxy Host's **ShieldPM-to-application** forwarding scheme.

## Related pages

- [Proxy Hosts](./Proxy-Hosts.md)
- [Tor Onion Services](./Tor-Onion-Services.md)
- [Access Lists](./Access-Lists.md)
