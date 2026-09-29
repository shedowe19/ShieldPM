# Request Rate Limiting

ShieldPM includes a built-in rate limiter for Proxy Hosts. Configure a sustained request rate per client IP and host, plus an optional burst allowance.

---

## 🏗️ How it Works

```
  ┌──────────┐         ┌──────────────────────────────────┐
  │  Client   │────────▶│          Rate Limiter             │
  │  (IP)     │         │    (Lua resty.limit.req)         │
  └──────────┘         │                                  │
                       │  Leaky bucket per host + IP:     │
                       │  ┌───────────────────────────┐   │
                       │  │  Within rate            │───▶ ✅ ALLOW
                       │  │  Within burst           │───▶ ⏳ DELAY
                       │  │  Above bucket capacity  │───▶ ❌ 429
                       │  └───────────────────────────┘   │
                       │                                  │
                       │  Storage: Nginx shared memory    │
                       └──────────────────────────────────┘
```

When a client exceeds the defined rate (plus any allowed burst), Nginx rejects the request with **HTTP 429 Too Many Requests**.

---

## ⚙️ Configuration

Configure Rate Limiting on a per-host basis:

1. Edit a **Proxy Host**
2. Navigate to the **Security** tab
3. Set the following fields:

| Field     | Description                                                                    | Example |
| :-------- | :----------------------------------------------------------------------------- | :------ |
| **Rate**  | Number of requests allowed per time unit. `0` = disabled.                      | `10`    |
| **Per**   | Time unit: seconds or minutes (the generated Nginx template stores `s` or `m`) | Minute  |
| **Burst** | Extra requests to queue (softens spikes)                                       | `20`    |

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

**Result:** The limiter targets a sustained rate of 5 requests per minute. It is a leaky-bucket rate, not a quota that resets at a fixed minute boundary; with no burst, closely spaced requests may be rejected even before five requests have occurred in the current clock minute.

### General API Protection

Prevent a single user from monopolizing API resources:

| Setting   | Value  |
| :-------- | :----- |
| **Rate**  | 100    |
| **Per**   | Second |
| **Burst** | 50     |

**Result:** Users can sustain about 100 req/s. Up to 50 excess requests may wait for a slot; traffic beyond the bucket capacity receives 429.

### Light Website Protection

Soft rate limiting for a public website:

| Setting   | Value  |
| :-------- | :----- |
| **Rate**  | 30     |
| **Per**   | Minute |
| **Burst** | 60     |

**Result:** The sustained rate is 30 req/min. Up to 60 excess requests can queue and wait; legitimate page loads may also be delayed or rejected if they exceed the configured bucket.

---

## 🔬 Technical Details

| Property             | Value                                                                                           |
| :------------------- | :---------------------------------------------------------------------------------------------- |
| **HTTP Status Code** | `429 Too Many Requests`                                                                         |
| **Storage Backend**  | Nginx shared memory zone `ip_req_limit` (zone size belongs to the deployed Nginx configuration) |
| **Lua Module**       | `resty.limit.req` (OpenResty)                                                                   |
| **Tracking**         | Per client IP address                                                                           |
| **Scope**            | Per Proxy Host (independent limits per host)                                                    |

> [!TIP]
> Rate limiting works best when combined with **[CrowdSec](CrowdSec)** for repeat offenders. CrowdSec can permanently ban IPs that trigger too many 429 responses.

---

[🏠 Home](Home) | [🛡️ Security Overview](Security) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
