# Dynamic DNS (DDNS)

ShieldPM can update DNS records when the public address seen by its backend changes. Create a provider in **DDNS Providers** and select whether it should update IPv4, IPv6, or both. This does not make a service behind CGNAT reachable on IPv4 by itself.

## Supported providers

| Provider   | Configuration                                                             | Update behavior                                                                                |
| ---------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Cloudflare | Zone ID, API token with permission to edit DNS in that zone, domain names | Updates existing A and/or AAAA records, or creates missing records for configured names.       |
| DuckDNS    | DuckDNS token and domain names                                            | Sends the selected public IPv4/IPv6 addresses to DuckDNS.                                      |
| Custom URL | HTTP(S) update URL and domain names                                       | Sends a GET to a publicly routable URL; replaces `{IP}` or `{IPv4}`, `{IPv6}`, and `{DOMAIN}`. |

Enter the domain names in the provider form. Choose the IP version appropriate for that provider and record. For a custom URL, placeholders for an unavailable IP version become empty. Custom URL requests reject localhost, private or reserved network addresses, and redirects; the resolved address is checked again when connecting. A custom endpoint on your private LAN will therefore not work.

## Detection and updates

- IPv4 is detected through `https://api.ipify.org?format=json`; IPv6 through `https://api6.ipify.org?format=json`. The latter contributes an IPv6 address only if the request actually returns IPv6.
- The backend checks every 60 seconds and shortly after startup. It updates a provider when a selected public IP differs from that provider's last successful address, or retries a previous error. Creating or changing a provider triggers a forced run.
- The provider list displays the last IPv4/IPv6 values, last update, and error. The provider form offers a **Test** action for an immediate update of a saved provider.

If the backend cannot reach an IP detection service over the required address family, it cannot update that address family. Verify outbound connectivity before troubleshooting the DNS record itself.

## GitOps and credentials

When GitOps is configured, DDNS provider entries are exported to `ddns-providers/*.yaml` and can be restored. **Treat the GitOps repository as sensitive:** provider `config` contains the Cloudflare/DuckDNS token or custom update URL, and those values are included in the YAML export. Keep the repository private, control access and backups, and rotate a token if it has been exposed. GitOps connection testing warns when a repository appears public.

## Related pages

- [GitOps](./GitOps.md)
- [Cloudflare Tunnels](./Cloudflared-Tunnels.md)
- [IPv6](./IPv6.md)
