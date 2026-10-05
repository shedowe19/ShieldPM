# IP Firewall per Proxy Host

## Purpose

The IP Firewall blocks IPv4 addresses, IPv6 addresses, CIDR networks, autonomous system numbers (ASNs), and selected GeoIP country assignments before requests reach a protected HTTP service. Maintain reusable lists centrally, then decide independently which lists, ASNs, and countries each Proxy Host uses.

Blocked visitors receive a dedicated page with the matching rule or list, its public reason, their IP address, a request reference, and an optional support link. Membership in a VPN or datacenter list describes an address classification; it does **not** prove that a visitor attacked your service.

The page embeds ShieldPM's original SVG icon and keeps the explanation and request details readable on phones. Short CSS animations settle within a few seconds; the system's reduced-motion preference disables animation. Everything is included in the page, so no external images, fonts, or scripts are loaded.

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

The host's configuration preview summarizes generated IP rule tables with entry counts and fingerprints, keeping large lists readable. Changes to the address rules change the fingerprint; saving still applies the complete rules. Preview access requires permission to read every list assigned to the saved host or draft, including assignments removed in the draft.

| Host example           | Firewall selection              |
| ---------------------- | ------------------------------- |
| Public website         | VPN list                        |
| Administration service | VPN and datacenter list         |
| Media service          | Host-specific blocked addresses |
| Another service        | Firewall disabled               |

Select at most 32 central lists per host. Up to 1,000 manual blocks and 1,000 exceptions are supported.

## Understand exceptions and reasons

An exception overrides matching blocks from this IP Firewall. It does not bypass Access Lists, login, mTLS, CrowdSec, or WAF rules.

When several blocks match, host-specific manual IP rules take precedence over subscribed IP lists, followed by ASN rules and then country rules. The public reason belongs to the matching rule. The additional host message can explain your service policy or how to request assistance.

The internal note is administrative and is never included in the public blocking page. List descriptions are also kept out of that page. Avoid putting private details in a public reason or public message.

The blocking page uses German when the request's language preference starts with `de`; otherwise it uses English. API clients requesting `application/json` without `text/html` receive a structured `ip_blocked` response with the same public reason and request reference.

Public reasons, list names, messages, and support URLs retain their text within the documented limits, including Unicode and escaped characters. They are embedded in bounded Lua string segments before HTML escaping or JSON encoding, so long valid text does not exceed Nginx's Lua configuration-token buffer.

## Block countries for a host

In **Proxy Host → Security → IP Firewall**, use the searchable **Country filter** selection to choose countries by name or ISO code. An optional country reason can explain your policy; leaving it blank uses a factual default explanation. Country rules apply when the host's IP Firewall is enabled. Address exceptions also override country blocks.

**Block unknown countries** is a separate option and is off by default. Empty or unsupported GeoIP results are treated as unknown (`XX`); `XX` is not a selectable country code. Unknown results remain allowed by the country filter unless you explicitly enable that option.

Country filtering reuses the existing [Analytics GeoIP setup](./Analytics.md#enabling-geoip-country-statistics), including its MMDB database and Nginx country lookup. ShieldPM prepares Country, City, and ASN databases automatically at each startup by default; no MaxMind credentials or separate updater are needed. Enable `NGINX_LOAD_GEOIP2_MODULE=true` to use these lookups. Offline or custom database installations can set `GEOIP_AUTO_UPDATE=false`. The country refers to the database's classification of the visitor IP, rather than a verified physical location.

Use a Country or City database for this lookup. An ASN database identifies networks and does not supply country codes; missing country results follow the **Block unknown countries** setting. The readiness check verifies the Nginx configuration and file presence, rather than validating the database's contents, schema, or full integrity. Nginx configuration is tested before activation.

The editor checks GeoIP readiness and explains whether the module, database, or country configuration is missing. While that check is loading, fails, or reports unavailable, you can remove saved country rules but cannot add new ones or enable unknown-country blocking. Use **Check again** after correcting the existing GeoIP setup. A disabled firewall with saved country rules cannot be re-enabled until GeoIP is ready or those rules are removed. Manual IP and list blocking remain available without GeoIP.

The check follows included Nginx configuration files and rejects conflicting country-variable definitions or directives that overwrite the country result. The country lookup must use the same trusted visitor IP as the address rules. Use an absolute MMDB path in the shared configuration; relative database paths are reported as unavailable.

A disabled Proxy Host with active country rules also requires country readiness before it can be enabled again. A failed check leaves that host disabled.

## Block autonomous systems for a host

In **Proxy Host → Security → IP Firewall**, add ASN rules independently of your IP lists and country selection. Enter a number from **1 to 4,294,967,295**, such as `13335` or `AS13335`, and an optional public explanation. The `AS` prefix is case-insensitive and is converted to a number before saving. Up to **1,000 unique ASNs** are supported per host; duplicate numbers are rejected even when their reasons differ. A reason can contain up to 1,000 characters; an empty reason uses a factual default explanation.

An ASN identifies a network and can have an organization name in the database. It does not identify the visitor or prove an attack. Blocking an ASN can affect many addresses belonging to that network.

ASN lookup needs the existing GeoIP2 module and the `GeoLite2-ASN.mmdb` file in `/data/nginx`, included in the default automatic startup download. Enable `NGINX_LOAD_GEOIP2_MODULE=true` and restart ShieldPM to prepare the lookup. For custom databases, set `GEOIP_AUTO_UPDATE=false` and include `GeoLite2-ASN` in your updater's editions. See [Analytics GeoIP setup](./Analytics.md#enabling-geoip-country-statistics). ASN support is checked independently of country support. Keep the Country/City files referenced by active Analytics configuration blocks available as well.

The editor checks ASN support independently. While that check is loading, fails, or reports unavailable, existing reasons can be edited and rules removed, but numbers cannot be changed or new rules added. A firewall or disabled host with active ASN rules cannot be enabled until ASN support is ready or those rules are removed. Use **Check again** after correcting the setup. Invalid or duplicate ASN input must be corrected before saving or previewing the host; changing tabs keeps that unfinished input. IP and country rules remain available without ASN support. There is no **Block unknown ASNs** option; missing ASN assignments do not match an ASN rule.

Every blocked request can show the available country code, ASN, and network organization on the blocking page, in its JSON response, and in the firewall log, including when an IP rule supplied the reason. These values use the same trusted visitor IP. Missing optional data does not enable a blocking rule or prevent IP rules from working. A dedicated firewall analytics screen is not provided.

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

A failed download or invalid response keeps the previous valid list active. Inspect the last-update time and error in the list manager; a failed manual refresh also reloads that status. Nginx configuration changes are validated before activation. If activation fails, ShieldPM attempts to restore the previous list and host configurations. An incomplete recovery is reported with the affected parts instead of claiming that the previous list was retained.

Unsaved list edits survive background cache updates and load errors. If fresh server data changes the TXT content of an untouched form, validate that text again before saving. Saved host assignments can be removed even when their lists cannot be loaded; unavailable assignments show their IDs without another owner's list name.

Disabling a central list stops its rules on assigned hosts while preserving the assignment. To delete a list, first remove every host assignment, including assignments on hosts where the firewall is currently disabled.

## Deployment notes

- Behind Cloudflare or another reverse proxy, configure the trusted real-IP sources so that rules evaluate the visitor's address. Do not trust client-supplied IP headers indiscriminately.
- The firewall applies to normal Proxy Host routes, custom locations, upload routes, and initial WebSocket handshakes. Anubis protection is checked at the public host entrance.
- The dedicated page returns HTTP **403** and is not cached. Other authorization failures retain their existing handling.
- Already established WebSocket or streaming connections are not terminated when a list changes.
- The firewall exempts only `/.well-known/acme-challenge/<token>` requests with an ACME token. The static challenge location also disables inherited Basic Auth, OAuth2/Authentik auth requests, and Lua access handlers so existing challenge files can be served without a login. Server-level mTLS checks and forced HTTPS redirects still apply.
- TCP/UDP Streams and TLS passthrough are outside this feature's scope. The IP Firewall complements a WAF rather than inspecting request payloads for application attacks.

## Logs

Administrative list changes appear under **Audit Logs** with the list name and the translated **Firewall List** label. Creation, updates, deletion, and successful manual refreshes are recorded; refreshes appear as updates.

Matching requests are recorded as JSON lines in `/data/logs/ip_firewall_<host-id>.log`. These files are separate from the host's regular access log. A dedicated firewall analytics screen is not provided.

The bundled startup scripts preserve these logs across restarts and prepare the directory for the configured runtime user before Nginx validates the host configuration. Keep `/data` on persistent storage to retain the history across container replacements.

The bundled logrotate configuration includes these files. Enable `LOGROTATE=true` to use daily rotation; it is disabled by default. `LOGROTATIONS` controls the retained file count and defaults to 3. Native deployments must use the corresponding logrotate configuration.

## GitOps backups

GitOps exports include firewall lists, their last valid downloaded content, and host assignments. Restoring the saved content does not require downloading the feed immediately; enabled subscriptions can update afterward. Older backups without firewall-list data preserve existing lists.

URL subscriptions require a saved cache containing at least one valid entry, including disabled subscriptions. Missing, empty, or comment-only caches are rejected before that list is restored.

Removing obsolete firewall lists during a full restore is deferred until every import and the Nginx validation and reload succeed. A failed restore does not remove previous lists through this cleanup, and lists that are still assigned to hosts remain protected.

The restore is not one database transaction. Objects successfully imported before a later error can remain changed; review the reported errors before retrying.

## Related pages

- [Proxy Hosts](./Proxy-Hosts.md)
- [Access Lists](./Access-Lists.md)
- [Security](./Security.md)
- [OAuth2 Proxy](./OAuth2-Proxy.md)
- [Anubis](./Anubis.md)
- [Analytics](./Analytics.md)
- [GitOps](./GitOps.md)
- [Troubleshooting](./Troubleshooting.md)
