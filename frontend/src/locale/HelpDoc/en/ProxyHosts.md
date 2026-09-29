## What is a Proxy Host?

A Proxy Host is the incoming endpoint for a web service that you want to forward.

It provides optional SSL termination for your service that might not have SSL support built in.

Proxy Hosts are the most common use for the ShieldPM.

## Table columns

Open **Columns** on the right above the Proxy Hosts table. Use its checkboxes to show or hide the icon, owner, source, destination, SSL, access, status, service check, and latency independently. Your choices remain in this browser after a reload. Each row's actions menu stays visible. Hiding a column does not change a host's configuration or stop its service checks.

## Host monitoring

The **Service check** column reports whether the configured upstream is responding. It is separate from the Nginx host status. The adjacent **Latency** column shows the duration of the latest check in milliseconds, including failed checks. For a timeout, this is the time until the probe stopped; a missing check or paused monitor shows a dash.

Choose **Host monitoring** from a host's actions menu to enable HTTP(S) or TCP checks, choose the interval and timeout, and review recent results. HTTP(S) checks require a relative path such as `/health` and the expected status code. **Check now** runs a manual check after you save the configuration.

HTTPS upstream certificates are verified by default. **Skip certificate verification for HTTPS monitor** accepts self-signed, expired, or mismatched certificates for this check; the connection remains encrypted, but the server identity is not verified. HTTP and TCP checks have no TLS certificate verification. Client-facing TLS settings are unchanged.

You can enable alerts on availability changes through the host owner's configured Telegram integration. The message includes the checked target, elapsed time, and observed failure phase when available. A host without a monitor shows **Not configured**; a disabled host or monitor shows **Paused**. Use a health path that does not require login, or choose TCP to check basic connectivity.

## Host diagnostics

Choose **Diagnose host** from the actions menu to check DNS, local TLS and Nginx routing, the upstream connection, and, when applicable, authentication and WebSocket behavior. This one-time diagnosis does not change the saved host configuration; its local checks do not cover external CDNs or networks.
