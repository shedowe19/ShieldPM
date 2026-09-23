## What is a Proxy Host?

A Proxy Host is the incoming endpoint for a web service that you want to forward.

It provides optional SSL termination for your service that might not have SSL support built in.

Proxy Hosts are the most common use for the ShieldPM.

## Host monitoring

The **Service check** column reports whether the configured upstream is responding. It is separate from the Nginx host status. Choose **Host monitoring** from a host's actions menu to enable HTTP(S) or TCP checks, choose the interval and timeout, and review recent results. HTTP(S) checks require a relative path such as `/health` and the expected status code. **Check now** runs a manual check after you save the configuration.

You can enable alerts on availability changes through the host owner's configured Telegram integration. A host without a monitor shows **Not configured**; a disabled host or monitor shows **Paused**. Use a health path that does not require login, or choose TCP to check basic connectivity.
