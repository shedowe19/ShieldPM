# SSL Certificates

NPMplus makes managing SSL/TLS certificates easy, primarily using **Let's Encrypt**.

## 🆕 Requesting a Certificate

### HTTP-01 Challenge
*   **Prerequisite:** Port 80 must be forwarded from your router to NPMplus and accessible from the public internet.
*   **Usage:** Simplest method. Just toggle "SSL" in the Proxy Host and select "Request a new SSL Certificate".

### DNS-01 Challenge
*   **Prerequisite:** You own the domain and have API access to your DNS provider (e.g., Cloudflare, Route53, DigitalOcean).
*   **Usage:** Required for **Wildcard Certificates** (`*.example.com`) or if Port 80 is blocked.
*   **Configuration:**
    1.  Select "Use a DNS Challenge".
    2.  Choose your DNS Provider.
    3.  Enter the required API credentials in the text area (ini format).

## 📂 Custom Certificates

If you have your own certificates (e.g., from a corporate CA or bought manually):

1.  Go to the **SSL Certificates** tab.
2.  Click **Add SSL Certificate** -> **Custom**.
3.  Upload your **Certificate** (`.pem` / `.crt`) and **Certificate Key** (`.key`).
4.  (Optional) Upload an Intermediate Certificate/Chain.

## 🔒 Best Practices

### HSTS (HTTP Strict Transport Security)
Enabling HSTS tells browsers to *only* connect to your site via HTTPS for a specified period.
*   **Enable:** Check "HSTS Enabled" in the Proxy Host SSL tab.
*   **Subdomains:** To enforce it for all subdomains, ensure `NGINX_HSTS_SUBDOMAINS=true` in `compose.yaml`.

### HTTP/2 and HTTP/3
*   **HTTP/2:** Enabled by default for all HTTPS hosts.
*   **HTTP/3 (QUIC):** Enabled by default in NPMplus if you have exposed UDP port 443. Faster and more reliable on mobile networks.

### OCSP Stapling
NPMplus automatically handles OCSP stapling to improve privacy and connection speed. It checks the certificate validity with the issuer and serves this "stapled" response to the client.

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/NPMplus/issues)
