# Request Rate Limiting

ShieldPM includes a built-in Request Rate Limiting feature to protect your services from abuse, scraping, and brute-force attacks. This feature allows you to define a maximum number of requests a single IP address can make within a specified timeframe.

## How it Works

The Rate Limiting implementation uses Nginx's `resty.limit.req` (Lua) module. It tracks requests per IP address in a high-performance shared memory zone (`ip_req_limit`).

When a client exceeds the defined rate (plus any allowed burst), Nginx will reject the request with a **429 Too Many Requests** status code.

## Configuration

You can configure Rate Limiting on a per-host basis in the **Proxy Host** dialog.

1.  Edit a Proxy Host.
2.  Navigate to the **Security** tab.
3.  **Rate (Requests)**: Enter the number of requests allowed (e.g., `10`). Set to `0` or leave empty to disable.
4.  **Per**: Select the time unit:
    *   **Second**: Useful for high-traffic APIs or strict limiting.
    *   **Minute**: Useful for softer limits or general browsing.
5.  **Burst**: Enter the number of allowed pre-queued requests (e.g., `20`). This allows legitimate traffic spikes to pass through without being rejected immediately, as long as the average rate stays within limits.

## Example Scenarios

### Anti-Abuse for Login Pages
If you want to protect a login page from brute-force attempts:
*   **Rate**: 5 requests
*   **Per**: Minute
*   **Burst**: 0
*   *Result:* An IP can only make 5 requests per minute. Anything more is blocked immediately.

### API Protection
If you are hosting an API and want to prevent a single user from hogging resources:
*   **Rate**: 100 requests
*   **Per**: Second
*   **Burst**: 50
*   *Result:* Users can make up to 100 req/s. Short bursts up to 150 req/s are tolerated, but sustained high traffic will be throttled or blocked.

## Technical Details

*   **HTTP Status**: `429 Too Many Requests`
*   **Storage**: Shared Memory (`20MiB` dedicated zone).
*   **Lua Module**: `resty.limit.req`
