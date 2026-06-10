# Request Rate Limiting

ShieldPM includes a built-in Rate Limiting feature to protect your services from abuse, scraping, and brute-force attacks. It allows you to define a maximum number of requests a single IP address can make within a specified timeframe.

---

## 🏗️ How it Works

```
  ┌──────────┐         ┌──────────────────────────────────┐
  │  Client   │────────▶│          Rate Limiter             │
  │  (IP)     │         │    (Lua resty.limit.req)         │
  └──────────┘         │                                  │
                       │  Request count per IP:           │
                       │  ┌───────────────────────────┐   │
                       │  │  IP: 1.2.3.4 → 8/10 req  │───▶ ✅ ALLOW
                       │  │  IP: 5.6.7.8 → 15/10 req │───▶ ❌ 429 Too Many
                       │  │  IP: 9.0.1.2 → 3/10 req  │───▶ ✅ ALLOW
                       │  └───────────────────────────┘   │
                       │                                  │
                       │  Storage: Shared Memory (20MB)   │
                       └──────────────────────────────────┘
```

When a client exceeds the defined rate (plus any allowed burst), Nginx rejects the request with **HTTP 429 Too Many Requests**.

---

## ⚙️ Configuration

Configure Rate Limiting on a per-host basis:

1. Edit a **Proxy Host**
2. Navigate to the **Security** tab
3. Set the following fields:

| Field     | Description                                               | Example  |
| :-------- | :-------------------------------------------------------- | :------- |
| **Rate**  | Number of requests allowed per time unit. `0` = disabled. | `10`     |
| **Per**   | Time unit: `second` or `minute`                           | `minute` |
| **Burst** | Extra requests to queue (softens spikes)                  | `20`     |

### How Burst Works

| Without Burst (Burst = 0)                                 | With Burst (Burst = 20)                                                  |
| :-------------------------------------------------------- | :----------------------------------------------------------------------- |
| Requests over the rate are **immediately rejected** (429) | Up to 20 extra requests are **queued** and processed at the defined rate |
| Strict enforcement                                        | More forgiving for legitimate traffic spikes                             |
| Best for: Login pages, sensitive APIs                     | Best for: General browsing, public APIs                                  |

---

## 📋 Example Scenarios

### Anti-Brute Force (Login Pages)

Protect login pages from brute-force attacks:

| Setting   | Value  |
| :-------- | :----- |
| **Rate**  | 5      |
| **Per**   | Minute |
| **Burst** | 0      |

**Result:** An IP can only make 5 requests per minute. Any additional request is immediately blocked with 429.

### General API Protection

Prevent a single user from monopolizing API resources:

| Setting   | Value  |
| :-------- | :----- |
| **Rate**  | 100    |
| **Per**   | Second |
| **Burst** | 50     |

**Result:** Users can sustain 100 req/s. Short bursts up to 150 req/s are tolerated, but sustained high traffic is throttled.

### Light Website Protection

Soft rate limiting for a public website:

| Setting   | Value  |
| :-------- | :----- |
| **Rate**  | 30     |
| **Per**   | Minute |
| **Burst** | 60     |

**Result:** Normal browsing (30 req/min) is unaffected. Fast page loads with many assets are queued. Only abusive crawlers are blocked.

---

## 🔬 Technical Details

| Property             | Value                                        |
| :------------------- | :------------------------------------------- |
| **HTTP Status Code** | `429 Too Many Requests`                      |
| **Storage Backend**  | Shared memory zone (`ip_req_limit`, 20 MiB)  |
| **Lua Module**       | `resty.limit.req` (OpenResty)                |
| **Tracking**         | Per client IP address                        |
| **Scope**            | Per Proxy Host (independent limits per host) |

> [!TIP]
> Rate limiting works best when combined with **[CrowdSec](CrowdSec)** for repeat offenders. CrowdSec can permanently ban IPs that trigger too many 429 responses.

---

[🏠 Home](Home) | [🛡️ Security Overview](Security) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
