# Security Overview

ShieldPM integrates robust security features to protect your services.

## 🛡️ Core Features
*   **HTTP/3 (QUIC) & TLS 1.3:** Modern, secure protocols enabled by default.
*   **HSTS:** Enforce HTTPS security headers.

## 🦅 CrowdSec (IPS)
Detect and block attacks using community-driven threat intelligence.
👉 **[Read the CrowdSec Deep Dive](CrowdSec)**

## 🔥 ModSecurity (WAF)
Inspect traffic for malicious payloads using OWASP Core Rule Set.
👉 **[Read the ModSecurity Deep Dive](ModSecurity)**

## 🛑 Access Control
Restrict access using Basic Auth and IP ranges.
👉 **[Read the Access Lists Guide](Access-Lists)**

## 🔐 OpenAppSec
AI-based WAF using machine learning — no signature databases needed.
*   Requires `NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true`.

👉 **[Read the OpenAppSec Guide](OpenAppSec)**

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
