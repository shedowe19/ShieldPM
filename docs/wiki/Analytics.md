# Advanced Analytics

ShieldPM includes a built-in traffic dashboard. The backend parses local Nginx JSON access logs and stores request details and aggregates in the configured application database. Request details include client IPs, paths and user agents; treat that database and its backups as sensitive.

---

## 🏗️ Architecture

```mermaid
flowchart TD
  N["Nginx traffic"] --> L["JSON access log"]
  L --> B["Backend analytics tailer"]
  L --> G["GoAccess (optional)"]
  B --> D["Application database"]
  D --> A["Analytics API"]
  A --> R["React dashboard"]
```

---

## Key Features

- **Traffic Overview:** displays recently ingested request counts and the live network throughput of the server. Aggregates flush approximately every 10 seconds.
- **Requests Over Time:** Area chart showing traffic trends over the last 1h, 24h, 7d, or 30d.
- **Status Codes:** Bar chart breakdown of HTTP response codes (2xx, 3xx, 4xx, 5xx).
- **Top Lists:**
  - **Countries:** GeoIP-based breakdown of traffic sources.
  - **IPs:** Most frequent client IP addresses.
  - **Referrers:** Top domains linking to your services.
  - **Paths:** Most requested URL paths.
  - **User Agents:** Breakdown of browsers and devices.
- **Recent Requests:** Detailed table of the latest requests with method, status, path, IP, and duration.
- **Database Statistics:** engine-dependent metrics including:
  - **Database Size:** Current size of the application database.
  - **Engine Type:** Shows SQLite, MySQL, or PostgreSQL.
  - **Connections:** Number of active database connections.
  - **Read/Write I/O:** Cumulative read and write operations:
    - **SQLite:** Attempts `PRAGMA cache_stats`; when unavailable, I/O counters remain zero.
    - **MySQL:** Uses `Handler_read_rnd_next` and `Handler_write` status variables.
    - **PostgreSQL:** Uses `blks_read`, `blks_hit`, and tuple statistics from `pg_stat_database`.

## Live Traffic Flow (experimental)

Traffic Flow and live measurement are enabled by default. Administrators can change
both under **Settings → Traffic Flow** and choose client-address visibility in the
same panel. Open **Analytics → Live Traffic Flow** to inspect authorized hosts;
server-side Analytics and Proxy Host permissions are rechecked for every snapshot.

The columns show clients → schematic Internet → individual Proxy Hosts → upstream
targets. Multiple domains remain one host. Expand groups, search hosts, switch to
the accessible list, or pause updates. Internet is a visual connector, not a
discovered network hop; its two segments must not be summed as separate traffic.

Live rates require the native traffic module from the matching **shieldpm-nginx**
build. ShieldPM probes its capability in an isolated configuration before adding
the directive. On an older binary, the saved live preference remains enabled but
measurement falls back safely to completed requests; Settings explains the missing
module. Installing the matching binary and saving again (or restarting) reprobes
support. Merely selecting live mode never fabricates a rate.

Saving applies settings through validated, serialized Nginx reconfiguration of
existing active hosts, without a service restart or a manual host-by-host save.
If validation, reload or persistence fails, previous settings and configurations
are restored and the UI retains the unsaved draft. Startup reconciliation also
preserves previously isolated erroneous hosts; a safely rolled-back activation
failure leaves the application available with a configuration diagnostic.

Native measurement polls every second even while waiting for its first sample;
completion-only mode refreshes every five seconds.

The native module samples cumulative counters during active transfers, initially,
approximately every second, and at completion. Rates use actual monotonic elapsed
time between samples. For HTTP/1 they measure **HTTP bytes accepted by Nginx transport**,
including headers; HTTPS counters describe plaintext accepted by TLS. They do not
measure wire packets, TCP acknowledgements, or confirmed delivery. Both client
upload/download and individual upstream-attempt upload/download are measured for
HTTP/1 proxy traffic, HTTP/2 streams and WebSocket upgrades. HTTP/2 sent bytes
include per-stream frame headers; received bytes use request accounting and do
not distribute connection-wide frames. WebSocket counters include the handshake
and actual frame transport bytes. HTTP/3 download rates measure unique QUIC
stream bytes acknowledged by the peer; upload rates measure consumed decrypted
stream bytes, including HTTP/3 framing. Queued output and retransmitted copies
are not additional acknowledged bytes. This is neither wire throughput nor the
same accounting as HTTP/1 accepted writes. The stream observer survives request
cleanup until stream closure; final samples without complete acknowledgement
coverage remain unknown. Other upstream protocols remain unknown. No system
totals or completion logs are substituted.

Supported fresh sources refresh approximately every second. A missing baseline,
counter reset, unsupported protocol, or gap exceeding 3.5 seconds gives unknown,
not zero. Group totals are unknown when any included observation is unknown or when byte
accounting methods differ. Tooltips identify each direction’s measurement method;
accepted transport bytes are not summed with acknowledged stream bytes. Expand
**Measured groups by byte accounting** within a mixed client prefix to inspect
compatible components with their own exact rates, windows and shared scale.
Component identities describe accounting methods, never people or devices.
The disclosure stays attached to the client group: when no current components
exist, it keeps the last measured breakdown for up to 60 seconds, marks it as
last measured, and then shows that no current breakdown exists instead of
disappearing.
Exact tooltips show directional rates, sample windows and the number of samples;
group window bounds enclose the individual request intervals. Displayed line
widths use a 0.35 exponential moving average and one fixed logarithmic scale:
`min(16, 2 + log2(1 + bytes_per_second / 1024))` pixels. Exact values are unsmoothed.
The two schematic Internet segments repeat the same client aggregate.

- Solid lines identify recently observed paths. Upstream
  addresses are concrete recorded TCP peers/attempts, not proof of a successful
  response. Retries do not create extra client requests. Client groups and
  upstream observations are summarized separately per host; they do not claim
  a one-to-one client-to-upstream connection map.
- Dashed lines identify configured direct, pool, or location targets. DNS names
  do not assert which address was used. Advanced configuration can add unknown
  paths; Anubis observation and TCP/UDP Streams are not supported.
- Dotted lines and unknown rates indicate missing evidence, not zero traffic.
  Cache hits do not create upstream observations. Counts and response body bytes
  are completed-request samples, not wire bytes, upload bytes, or current rates.

Collection uses best-effort loopback UDP on port 15149 with an 8 KiB datagram cap
and a 2,000 datagram/second processing budget. At most 1,000 completion records and 1,000 native request records
are retained for a 60-second visible window. Snapshots contain at most 100 hosts,
32 client groups and 32 observed peers per host. The sample is always marked
incomplete: native tracking is capped at 256 requests per worker and 16 upstream
attempts per request; UDP loss and bounded retention make exact totals impossible. Collector
errors and stale snapshots are shown explicitly; an idle collector cannot prove
that there was no traffic. Other local processes can send to the UDP port, so this
view is operational telemetry, not security evidence.

### Client visibility and privacy

**Settings → Traffic Flow → Client display** offers three explicit choices:

- **Anonymized networks** (default): retain IPv4 /24 and IPv6 /48 prefixes in the
  short-lived flow buffer; an IPv4 label such as `192.0.2.*` is not one device.
- **Individual IP addresses**: retain validated addresses in that same ephemeral,
  permission-scoped buffer. This requires an explicit selection and save.
- **Do not show addresses**: discard the address after validating the incoming
  observation and retain only a fixed hidden client group for the host. No IP or
  network prefix is returned in flow snapshots.

Saving a visibility change clears all earlier flow samples. An address, prefix or
hidden group never identifies a person or device. The dedicated telemetry contains
no URLs, headers, cookies or body content and creates no additional disk log or
historical database writes. Numeric client addresses still reach the loopback
receiver from Nginx; the selected transformation happens before flow-buffer retention.

**These controls apply to Traffic Flow, not existing access logs, GoAccess or the
separate historical Analytics database.** Historical Analytics may continue to
retain raw IPs and request details under its existing retention policy. Hiding a
flow address does not erase those records. Attribution behind another proxy still
depends on the existing trusted Real-IP configuration.

### Existing installations and environment compatibility

A migration creates one persistent `traffic-flow` setting. With no legacy variables,
normal flow and live measurement default to enabled and client visibility to
anonymized networks. Explicit previous environment preferences are imported once;
after that, the saved database setting is authoritative. Editing an old
`TRAFFIC_FLOW_ENABLED`, `TRAFFIC_FLOW_LIVE_ENABLED` or `TRAFFIC_FLOW_CLIENT_MODE`
variable cannot silently override a later choice made in Settings. No environment
changes are needed for ordinary use in Docker or native installations.

### Missing-rate diagnostics

Configured and observed targets with the same canonical numeric IP and port are
shown once with both origins. DNS names are never guessed to match observed IPs.
A configured-only target has no measured rate; its existence is not traffic.

Completed request counts prove only the completion-log path. They do not prove
that native live instrumentation is installed or receiving samples. The API's
`diagnostics` reports the saved live preference, receiver state, last native sample
for authorized hosts only, and a reason such as native disabled, no native
sample, unsupported, stale or collector error. A short completed native transfer
can show its actual measured interval briefly, but is not an active connection.
Incomplete groups retain measured components without presenting a partial total
as complete.

For a native/bare-metal installation, check the following in order:

1. Check **Settings → Traffic Flow** for saved flow/live preferences, client mode
   and the effective native capability. Saving again reprobes capability.
2. Confirm the installed Nginx binary contains the module with
   `nginx -V 2>&1 | grep ngx_http_shieldpm_flow_module`; use the matching native
   build if absent. Docker installations need the matching base image instead.
3. A successful settings save regenerates existing active host configurations.
   Check `nginx -t`. Inspect only telemetry directives with
   `nginx -T 2>/dev/null | grep 'shieldpm_traffic_flow '`, avoiding full configuration
   or environment dumps, which can contain credentials.
4. Check `ss -lun 'sport = :15149'` and the scoped receiver diagnostics. Run a
   sustained authorized transfer and watch the native timestamp advance. No native
   timestamp means that measurement path remains unconfirmed; completion counts
   alone do not prove live telemetry.

To disable collection, turn off **Traffic Flow** and save. To retain completion
observations without native rates, disable only **Live measurement**. A successful
save removes the corresponding directives and clears short-lived buffers; a failed
save keeps the previous active state. Disable live measurement successfully before
replacing Nginx with a binary that lacks the native module. No historical-data
rollback or deletion is implied by these controls.

Measurement evidence can be reproduced with an installed ShieldPM Nginx binary:

```bash
TRAFFIC_SMOKE_NGINX_BIN=/path/to/nginx \
TRAFFIC_SMOKE_LUA_DIRECTORY=/path/to/lua/5.1 \
node scripts/benchmarks/traffic-flow-measurement.mjs
```

The isolated loopback test holds a 128 KiB response open, checks that no log or UDP
observation exists while data is already arriving, then verifies the exact final
body-byte count, concrete upstream, masked prefix, and unknown rate through the
actual template and collector parser. The actual native source and application collector can be checked together:

```bash
TRAFFIC_SMOKE_NGINX_BIN=/path/to/native-module/nginx \
node scripts/benchmarks/traffic-flow-native-measurement.mjs
```

This test verifies active client and upstream download/upload rates before
completion, exact cumulative-counter differences and masked prefixes. The native
repository additionally validates keepalive resets, retries, abort cleanup,
HTTPS, reload generations, and HTTP/2 multiplexed cross-host isolation and open WebSocket bidirectional frames.
HTTP/3 is additionally validated with simultaneous cross-host streams, a held
upload, packet loss and delayed acknowledgements, reset/disconnect cleanup, and
stream churn. To verify a real native capture through the application collector:

```bash
node scripts/benchmarks/traffic-flow-native-capture.mjs /path/to/native-samples.json
```

The final production-image capture contained 555 requests; the app independently
verified 869 exact counter intervals, including 52 active download and 14 active
upload intervals. The production binary passed the module gate, 694 runtime
samples, 28 HTTP/2/WebSocket protocol samples and seven HTTP/3 cases covering
packet loss, delayed acknowledgements, resets, disconnects, capacity and reloads. These counts describe the test run, not production traffic totals.

## Privacy

The built-in analytics service does not need a third-party analytics provider. It stores IP addresses and other request details locally. By default, detailed database rows are deleted after 24 hours and minute aggregates after 35 days; the retention job runs on startup and hourly. Set `ANALYTICS_DETAILED_RETENTION_HOURS` and `ANALYTICS_AGGREGATION_RETENTION_DAYS` to change those periods. Nginx log-file rotation is a separate mechanism. GoAccess can be configured independently with its own `GOACLA` options, including IP anonymization.

## Configuration

Built-in analytics are enabled by default. GoAccess is **off** by default (`GOA=false`); enable it with `GOA=true` to use its separate dashboard on `GOA_PORT` (default `91`). Per-host analytics is limited to hosts the user can view according to server-side permission checks; global analytics requires the `analytics:list` permission.

### Enabling GeoIP (Country Statistics)

ShieldPM prepares `GeoLite2-Country.mmdb`, `GeoLite2-City.mmdb`, and `GeoLite2-ASN.mmdb` in `/data/nginx` automatically before services start. The default `GEOIP_AUTO_UPDATE=true` checks the [latest GeoLite.mmdb release](https://github.com/shedowe19/GeoLite.mmdb/releases/latest) on the first start and every later start. This needs no MaxMind account, license key, or separate updater container.

If a shared public IP reaches GitHub's anonymous API rate limit, an optional `GEOIP_GITHUB_TOKEN` authenticates only the exact latest-release metadata request. It is never forwarded to redirects or database assets. Leave it unset for the default public download; keep any configured token private.

Files already matching the release's size, SHA-256 digest, and database validation are reused. New files are staged and all three databases verified before replacement: the native MMDB reader must open each file with the expected database type and format. If downloading or verification fails, a complete valid previous cache permits startup with a warning; without that cache, startup stops before services run. Unsafe destination paths, another running updater, or incomplete recovery also stop startup. Automatic updates run during startup.

Downloading the files is independent of module activation. To use country statistics and the firewall's country/ASN lookups, enable the GeoIP2 module.

#### 1. Enable the Nginx module

```yaml
# Docker (compose.yaml)
environment:
  - "GEOIP_AUTO_UPDATE=true" # default; prepares all three databases at startup
  - "NGINX_LOAD_GEOIP2_MODULE=true"
```

```bash
# Native / LXC (/data/.env)
GEOIP_AUTO_UPDATE=true
NGINX_LOAD_GEOIP2_MODULE=true
```

#### 2. Restart ShieldPM

```bash
# Docker
docker compose up -d

# Native / LXC
systemctl restart shieldpm
```

Once started, Nginx uses the prepared databases and new requests can include country and ASN information. With `GOA=true`, GoAccess also discovers City, Country, and ASN files in `/data/nginx` at startup. For each database, an existing non-empty file in `/data/goaccess/geoip` takes precedence. An explicit `--geoip-database` setting in `GOACLA` disables this automatic discovery.

### Offline or custom GeoIP data

Set **`GEOIP_AUTO_UPDATE=false`** in the ShieldPM environment to disable the automatic GitHub release check and downloads. Use this for offline installations or databases maintained through your own MaxMind updater. Provide the files required by active Nginx GeoIP blocks in `/data/nginx`; module activation remains a separate setting.

**Docker with a custom MaxMind updater:** Keep `GEOIP_AUTO_UPDATE=false` on the ShieldPM service and configure the optional sidecar with your own [MaxMind account](https://www.maxmind.com/en/geolite2/signup):

```yaml
geoipupdate:
  container_name: shieldpm-geoipupdate
  image: ghcr.io/maxmind/geoipupdate:latest
  restart: always
  network_mode: bridge
  environment:
    - "TZ=Europe/Berlin"
    - "GEOIPUPDATE_EDITION_IDS=GeoLite2-Country GeoLite2-City GeoLite2-ASN"
    - "GEOIPUPDATE_ACCOUNT_ID=<your-account-id>"
    - "GEOIPUPDATE_LICENSE_KEY=<your-license-key>"
    - "GEOIPUPDATE_FREQUENCY=24"
  volumes:
    - "/opt/shieldpm/nginx:/usr/share/GeoIP"
```

> [!IMPORTANT]
> The volume path must be `/opt/shieldpm/nginx` on the host side, as this maps to `/data/nginx` inside the ShieldPM container, which is where Nginx expects the files.

**Native / LXC with a custom MaxMind updater:** Set `GEOIP_AUTO_UPDATE=false` in `/data/.env`, then configure your own updater:

```bash
apt install -y geoipupdate
cat > /etc/GeoIP.conf << EOF
AccountID <your-account-id>
LicenseKey <your-license-key>
EditionIDs GeoLite2-Country GeoLite2-City GeoLite2-ASN
DatabaseDirectory /data/nginx
EOF
chmod 600 /etc/GeoIP.conf
geoipupdate
# Setup weekly cron
echo "0 3 * * 3 root /usr/bin/geoipupdate > /dev/null 2>&1" > /etc/cron.d/geoipupdate
```

Enable `NGINX_LOAD_GEOIP2_MODULE=true` and restart ShieldPM after first providing the custom databases. Existing independently configured updater services or cron jobs remain your responsibility; automatic startup downloads are disabled by the opt-out.

### ASN data for the IP Firewall

The [IP Firewall](./IP-Firewall.md#block-autonomous-systems-for-a-host) uses the same automatically prepared `GeoLite2-ASN.mmdb` to show the visitor network and apply per-host ASN rules. Keep `NGINX_LOAD_GEOIP2_MODULE=true`. For a custom updater, include `GeoLite2-ASN` in its editions. The firewall startup configuration uses `/data/nginx/GeoLite2-ASN.mmdb`; a file available only to GoAccess under `/data/goaccess/geoip` does not configure this Nginx lookup.

Keep the Country/City databases referenced by existing active Analytics blocks available. Their configuration and the existing GoAccess discovery remain unchanged. ASN data does not provide country codes, and this integration adds no ASN chart to the Analytics dashboard.

## Related pages

- [IP Firewall](./IP-Firewall.md)
- [Configuration](./Configuration.md)
- [Docker Compose reference](./Docker-Compose-Reference.md)
