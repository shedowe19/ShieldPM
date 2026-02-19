# Anubis AI Firewall

ShieldPM integrates [Anubis](https://github.com/TecharoHQ/anubis), a utility that "weighs the soul" of incoming HTTP requests to stop AI crawlers and bots.

## Enabling Anubis

### Docker / Systemd
Ensure the environment variable `ANUBIS_ENABLED=true` is set (default). Anubis starts automatically if the binary is present.

### Native Installation
Run the installer script `scripts/install.sh` and select "Y" when prompted to install Anubis.

### Per-Host Configuration
In the ShieldPM UI, edit a Proxy Host, go to the **Security** tab, and toggle **Anubis AI Firewall**.

## Configuration (Policy)

Anubis uses a policy file to define rules for blocking or allowing traffic.

By default, it uses a sensible built-in policy. To customize it:

1.  Create a policy file at `/data/anubis/policy.yaml` (or `.json`).
2.  Restart ShieldPM (or just the container).

### Extracting Default Policy
To see the default configuration, you can extract it from the binary:

```bash
# Inside the container or on the host
anubis -extract-resources /tmp/anubis-defaults
cat /tmp/anubis-defaults/policy.yaml
```

Copy this file to `/data/anubis/policy.yaml` and modify it.

### Example Policy Structure

```yaml
# /data/anubis/policy.yaml
bots:
  - name: "Allow Good Bots"
    rules:
      - "User-Agent: .*Googlebot.*"
      - "User-Agent: .*Bingbot.*"
    action: allow

  - name: "Block AI Scrapers"
    rules:
      - "User-Agent: .*GPTBot.*"
      - "User-Agent: .*CCBot.*"
    action: deny

# ... rest of configuration
```

See the [Anubis Documentation](https://anubis.techaro.lol/) for full policy syntax.
