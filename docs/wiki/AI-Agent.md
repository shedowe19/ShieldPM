# AI Agent

ShieldPM's optional AI chat accepts natural-language requests in the web interface and through [ChatOps](ChatOps). When the selected model returns a structured tool call, the backend can carry out the corresponding ShieldPM operation using the caller's permissions.

The web chat opens from the sidebar. Its conversation is kept in the current browser component and sent as history with later messages; it is not a persistent server-side conversation. ChatOps starts each received message with an empty conversation history.

## Configure the agent

An administrator opens **Settings → AI Agent**, enables the feature, and selects a provider:

- **Google Gemini:** Enter an API key and choose a model. The model field accepts an ID directly, or **Fetch Models** can request available Gemini models. The current fallback model in the code is `gemini-1.5-flash`; select a model that is actually available to your account.
- **Local / OpenAI-compatible:** Enter the base URL, optional API key, and model ID. A base URL on port `11434` without `/v1` uses Ollama's native `/api/chat` endpoint. Other URLs use the OpenAI-compatible chat endpoint. For a container deployment, `localhost` means the ShieldPM container, so enter an address reachable **from ShieldPM**.

| Setting       | Scope                                     | Behavior                                                              |
| ------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| Enabled       | Both providers                            | Disabled agents reject chat requests                                  |
| API key       | Gemini required; local provider as needed | Stored encrypted; use a key required by the configured endpoint       |
| Base URL      | Local / compatible                        | HTTP(S) address of the model server as seen from the ShieldPM backend |
| Model         | Both providers                            | Model identifier selected from the list or entered manually           |
| System prompt | Both providers                            | A custom prompt replaces the built-in default prompt                  |

**Fetch Models** queries the configured provider. For local providers, the model-list request uses the compatible `v1/models` endpoint; the endpoint must support that API for the list to appear. A model can also be entered manually. The local provider controls `num_ctx` (default `8192`), `num_batch` (`512`), `num_thread` (`4`), and `keep_alive` (`5m`). These options are sent with Ollama native requests and are not sent with OpenAI-compatible requests.

`num_ctx` controls the Ollama context window, `num_batch` its prompt-processing batch, and `num_thread` its CPU-thread setting. `keep_alive` controls how long Ollama keeps the model loaded after a request. For example, `5m`, `1h`, and `-1` express a duration or an indefinite stay according to the Ollama API. Choose values supported by your model server and hardware. Model discovery has a ten-second timeout; chat requests to local or compatible providers have a two-minute timeout.

The system prompt may be customized in the settings. Provider credentials are encrypted in stored settings using AES-256-GCM.

## Available operations

Depending on permissions, the current tool set covers:

| Area          | Available examples                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Hosts         | List, create, update, delete, enable, disable proxy, redirection, 404 hosts, and streams; toggle a proxy host's maintenance mode |
| Security      | Manage access lists, manage certificates, request an internal client certificate, inspect certificate details                    |
| Connections   | Manage DDNS providers, Cloudflare tunnels, and Tor onion services                                                                |
| Accounts      | List, create, update, delete users; change passwords and resource permissions                                                    |
| Observability | Read host counts, analytics summary/series, selected Nginx access/error logs, and the audit log                                  |
| System        | Read selected settings, update a setting, test or reload Nginx, refresh IP ranges                                                |

Individual tools expose specific fields and operations; for example, access-list tools cover basic credentials, client rules, and mTLS fields, but do not expose all OAuth/SSO settings. The status tool returns network-traffic information from the analytics service; it is not a CPU-and-memory health monitor. A list or update of another user's resource is still subject to the applicable owner scope.

The assistant does **not** have a tool to create a standalone API token or sign in as another user. It cannot directly carry out arbitrary commands. Sensitive tools are withheld unless the caller has the required capability; other tool definitions may still be visible to the model, but their underlying services check access before carrying out an operation. Some operations are restricted further in demo mode. The agent only executes structured provider tool calls; text that looks like a command is not treated as an executable tool call.

For example, `test_nginx_config`, `force_nginx_reload`, and IP-range renewal require the settings-update capability; reading audit entries requires audit-log access; generating an internal client certificate requires certificate-create access. For a regular user, AI operations remain limited by that user's resource permissions. A Telegram allowlisted sender acts with the permissions of the integration owner, so grant ChatOps access carefully.

## Verify changes

The backend runs up to five tool-call rounds per chat request. A model may make mistakes, and an attempted operation can fail. Check the returned result and the relevant page after a sensitive change. Service operations create audit entries only where their implementation calls the audit service; the audit record has no dedicated AI-origin field. There is no guarantee that **every** chat message or tool attempt is recorded as an audit entry.

[🏠 Home](Home) | [🤖 ChatOps](ChatOps) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
