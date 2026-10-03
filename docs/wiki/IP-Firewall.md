# IP Firewall per Proxy Host

## Purpose

The IP Firewall blocks IPv4 addresses, IPv6 addresses, CIDR networks, and selected GeoIP country assignments before requests reach a protected HTTP service. Maintain reusable lists centrally, then decide independently which lists and countries each Proxy Host uses.

Blocked visitors receive a dedicated page with the matching rule or list, its public reason, their IP address, a request reference, and an optional support link. Membership in a VPN or datacenter list describes an address classification; it does **not** prove that a visitor attacked your service.

## Set up a list

1. Open **L7 Firewall** and choose **Add blocklist**.
2. Enter a name and a public blocking reason. Keep the reason factual, for example: “This service does not accept connections from networks included in our selected VPN list.”
3. Choose pasted/uploaded text or an HTTPS subscription.
4. Preview the text and correct invalid lines before saving.
5. Save the list. Creating a list alone does not enable it for every host.

An example TXT file:

```text
# Documentation examples only
203.0.113.24
198.51.100.0/24
2001:db8:1234::/48
```

Use one IP address or network per line. Blank lines, `#` comments, UTF-8 BOM, and common line endings are supported. Duplicate and equivalent entries are combined, and networks are normalized. Hostnames and URLs inside TXT content are not supported. The maximum input is **8 MiB and 200,000 lines**, including comments and blank lines.

IPv4-mapped IPv6 addresses are converted to their IPv4 equivalent. For example, `::ffff:198.51.100.23/120` becomes `198.51.100.0/24`. Mapped network prefixes below `/96` are rejected because they extend beyond the IPv4-mapped range.

The preview reports valid entries, duplicates, and invalid line numbers. It does not change a saved list.

## Enable the firewall for a host

1. Edit the relevant **Proxy Host** and open **Security**.
2. Enable **IP Firewall**.
3. Select the central lists that should apply to this host.
4. Add any host-specific blocked IPs or networks and their public reasons.
5. Add trusted address exceptions when needed.
6. Optionally enter an additional public message, support URL, and internal note.
7. Save the host.

Existing hosts start with the firewall disabled. A list can be assigned to several hosts without requiring the same selection for every host.

| Host example           | Firewall selection              |
| ---------------------- | ------------------------------- |
| Public website         | VPN list                        |
| Administration service | VPN and datacenter list         |
| Media service          | Host-specific blocked addresses |
| Another service        | Firewall disabled               |

Select at most 32 central lists per host. Up to 1,000 manual blocks and 1,000 exceptions are supported.

## Understand exceptions and reasons

An exception overrides matching blocks from this IP Firewall. It does not bypass Access Lists, login, mTLS, CrowdSec, or WAF rules.

When several blocks match, host-specific manual rules take precedence over subscribed lists, which take precedence over country rules. The public reason belongs to the matching rule. The additional host message can explain your service policy or how to request assistance.

The internal note is administrative and is never included in the public blocking page. List descriptions are also kept out of that page. Avoid putting private details in a public reason or public message.

The blocking page uses German when the request's language preference starts with `de`; otherwise it uses English. API clients requesting `application/json` without `text/html` receive a structured `ip_blocked` response with the same public reason and request reference.

## Block countries for a host

In **Proxy Host → Security → IP Firewall**, use the searchable **Country filter** selection to choose countries by name or ISO code. An optional country reason can explain your policy; leaving it blank uses a factual default explanation. Country rules apply when the host's IP Firewall is enabled. Address exceptions also override country blocks.

**Block unknown countries** is a separate option and is off by default. Empty or unsupported GeoIP results are treated as unknown (`XX`); `XX` is not a selectable country code. Unknown results remain allowed by the country filter unless you explicitly enable that option.

Country filtering reuses the existing [Analytics GeoIP setup](./Analytics.md#enabling-geoip-country-statistics), including its MMDB database and Nginx country lookup. If that setup is already available, no additional database download, subscription, or external geolocation API is needed. The country refers to the database's classification of the visitor IP, rather than a verified physical location.

The editor checks GeoIP readiness and explains whether the module, database, or country configuration is missing. While that check is loading, fails, or reports unavailable, you can remove saved country rules but cannot add new ones or enable unknown-country blocking. Use **Check again** after correcting the existing GeoIP setup. A disabled firewall with saved country rules cannot be re-enabled until GeoIP is ready or those rules are removed. Manual IP and list blocking remain available without GeoIP.

When country rules are active, the blocking page, JSON response, and firewall log also show the detected country code, even when a manual or list rule supplied the blocking reason. A dedicated firewall analytics screen is not provided.

## Subscribe to X4BNet lists

The list editor offers two separate X4BNet URL presets:

| Preset                                                                                                    | Coverage                                             |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [VPN](https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt)                        | Networks classified as VPNs by the upstream project. |
| [VPN and datacenters](https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/datacenter/ipv4.txt) | A broader list that includes hosting networks.       |

The broader list can affect legitimate hosted services. Choose the preset for each host's access policy and use exceptions where appropriate. The source files identify networks, not an individual visitor's actions or a reliable provider-specific reason.

Source: [X4BNet/lists_vpn](https://github.com/X4BNet/lists_vpn), MIT. ShieldPM provides URL presets and downloads the selected content when a subscription is configured.

## Updates and failures

URL subscriptions require publicly reachable HTTPS sources and use an update interval of **6 to 168 hours**; the default is 24 hours. Use **Refresh** to fetch a source immediately. Local or private-network download targets are rejected. A source must return complete, uncompressed UTF-8 text within 15 seconds. Automatic updates apply only to enabled lists; failed attempts are retried after at least 15 minutes.

A failed download or invalid response keeps the previous valid list active. Inspect the last-update time and error in the list manager. Nginx configuration changes are validated before activation, and a failed activation restores the previous configuration.

Disabling a central list stops its rules on assigned hosts while preserving the assignment. To delete a list, first remove every host assignment, including assignments on hosts where the firewall is currently disabled.

## Deployment notes

- Behind Cloudflare or another reverse proxy, configure the trusted real-IP sources so that rules evaluate the visitor's address. Do not trust client-supplied IP headers indiscriminately.
- The firewall applies to normal Proxy Host routes, custom locations, upload routes, and initial WebSocket handshakes. Anubis protection is checked at the public host entrance.
- The dedicated page returns HTTP **403** and is not cached. Other authorization failures retain their existing handling.
- Already established WebSocket or streaming connections are not terminated when a list changes.
- Certificate challenge requests have a narrow ACME exception.
- TCP/UDP Streams and TLS passthrough are outside this feature's scope. The IP Firewall complements a WAF rather than inspecting request payloads for application attacks.

## Logs

Matching requests are recorded as JSON lines in `/data/logs/ip_firewall_<host-id>.log`. These files are separate from the host's regular access log. A dedicated firewall analytics screen is not provided.

The bundled logrotate configuration includes these files. Enable `LOGROTATE=true` to use daily rotation; it is disabled by default. `LOGROTATIONS` controls the retained file count and defaults to 3. Native deployments must use the corresponding logrotate configuration.

## GitOps backups

GitOps exports include firewall lists, their last valid downloaded content, and host assignments. Restoring the saved content does not require downloading the feed immediately; enabled subscriptions can update afterward. Older backups without firewall-list data preserve existing lists.

Removing obsolete firewall lists during a full restore is deferred until every import and the Nginx validation and reload succeed. A failed restore does not remove previous lists through this cleanup, and lists that are still assigned to hosts remain protected.

## Related pages

- [Proxy Hosts](./Proxy-Hosts.md)
- [Access Lists](./Access-Lists.md)
- [Security](./Security.md)
- [OAuth2 Proxy](./OAuth2-Proxy.md)
- [Anubis](./Anubis.md)
- [Analytics](./Analytics.md)
- [GitOps](./GitOps.md)
- [Troubleshooting](./Troubleshooting.md)
