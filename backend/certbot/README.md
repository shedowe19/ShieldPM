# Certbot dns-plugins

This file contains info about available Certbot DNS plugins.
This only works for plugins which use the standard argument structure, so:
`--authenticator <plugin-name> --<plugin-name>-credentials <FILE> --<plugin-name>-propagation-seconds <number>`

File Structure:

```json
{
  "cloudflare": {
    "name": "Name displayed to the user",
    "package_name": "Package name in PyPi repo",
    "credentials": "Template of the credentials file",
    "full_plugin_name": "The full plugin name as used in the commandline with certbot, e.g. 'dns-njalla'"
  },
  ...
}
```

The optional `credentials_argument` and `propagation_argument` fields override the
corresponding CLI option names (without the leading `--`). Otherwise both options
use `full_plugin_name` as their prefix, falling back to `dns-<registry-key>` when
no full name is provided. Explicit propagation time `0` is supported.
