# AI Agent (Administrator)

**ShieldPM** introduces a powerful embedded AI Agent that acts as a co-administrator for your server. It allows you to manage your Nginx Proxy Manager instance using natural language commands.

---

## 🏗️ Architecture

```
  ┌──────────────┐      ┌──────────────────────────────────────┐
  │  User         │─────▶│           ShieldPM AI Agent           │
  │  (Chat UI /   │      │                                      │
  │   Telegram)   │      │  ┌──────────────────────────────┐    │
  └──────────────┘      │  │     AI Provider               │    │
                        │  │  ┌────────┐  ┌──────────────┐ │    │
                        │  │  │ Gemini │  │ Local LLM    │ │    │
                        │  │  │ (Cloud)│  │ (Ollama etc.)│ │    │
                        │  │  └────────┘  └──────────────┘ │    │
                        │  └──────────┬───────────────────┘    │
                        │             │ Tool Calls              │
                        │             ▼                        │
                        │  ┌──────────────────────────────┐    │
                        │  │  ShieldPM API (Internal)     │    │
                        │  │  Hosts, SSL, Users, Nginx    │    │
                        │  │  Logs, Analytics, Tunnels    │    │
                        │  └──────────────────────────────┘    │
                        └──────────────────────────────────────┘
```

**Key Points:**

- The AI has **direct access** to ShieldPM's internal API
- All actions respect the **user's permissions** (RBAC)
- All actions are logged in the **Audit Log**
- API keys are stored **encrypted** (AES-256-GCM)

---

![AI Agent Interface](/images/wiki/ai-chat.png)

## Features

The AI Agent is not just a chatbot; it has **direct access** to the ShieldPM internals and can perform the following actions for you:

- **Hosts Management**:
  - **Proxy Hosts**: Create, Update, Delete, Enable, Disable, List, Search.
  - **Redirection Hosts**: Manage redirects.
  - **Dead Hosts**: Manage 404 responses.
  - **Streams**: Manage TCP/UDP streams.
- **Security & Access**:
  - **Access Lists**: Create/Update Access Lists (Basic Auth, OAuth, mTLS).
  - **Certificates**: Create (Let's Encrypt), Renew, Delete, View details.
- **Connectivity**:
  - **Cloudflare Tunnels**: Manage tunnels and tokens.
- **System & Monitoring**:
  - **Nginx Logs**: Read Access and Error logs directly.
  - **Analytics**: Analyze traffic summary and trends.
  - **Audit Log**: Review system actions.
  - **System Health**: Check CPU, Memory, and Network status.
- **User Management**: Create/Update users, Reset passwords, Manage permissions.

## Configuration

To enable and configure the AI Agent, go to **Settings** -> **AI Agent**.

### Providers

You can choose between two backend providers:

#### 1. Google Gemini (Cloud)

- **API Key**: Requires a valid API Key from [Google AI Studio](https://aistudio.google.com/).

* **Client library**: ShieldPM uses the maintained `@google/genai` SDK.
* **Model**: Use a model made available to the configured Google AI project; model availability can change upstream.
* **Note**: Very fast and reliable for general administration tasks.

#### 2. Local LLM / OpenAI Compatible (Self-Hosted)

Connects to any OpenAI-compatible API (e.g., Ollama, LocalAI, LM Studio) or your own OpenAI endpoints.

- **Base URL**: The URL of your LLM server.
  - _Examples_: `http://localhost:11434` (Ollama), `http://proserver:8080/v1` (LocalAI).
  - **Smart Ollama Support**: If you provide an Ollama URL (port 11434) without `/v1` suffix, ShieldPM automatically uses the **Ollama Native API** (`/api/chat`). This enables advanced features like precise context window control.
- **API Key**: Optional. Required if your local server enables auth, or if using real OpenAI APIs (`sk-...`).
- **Model**: The name of the model to use (e.g., `llama3`, `mistral`, `deepseek-coder`).
  - _Tip_: Use the **"Fetch Models"** button to list available models from your server.

### Advanced Settings (Local LLM)

**These settings are designed specifically for Ollama and may not work with OpenAI-compatible endpoints.**

When using Ollama (port 11434), ShieldPM automatically detects the native API and applies these performance tuning options:

- **Context Window (`num_ctx`)** (Default: `8192`):
  - Determines how much "memory" the AI has. Increase for complex tasks if hardware permits.
  - **Ollama only** - ignored by OpenAI-compatible servers.
- **Batch Size (`num_batch`)** (Default: `512`):
  - Controls parallel token processing.
  - **Ollama only** - ignored by OpenAI-compatible servers.
- **CPU Threads (`num_thread`)** (Default: `4`):
  - Number of CPU threads to use for inference.
  - **Ollama only** - ignored by OpenAI-compatible servers.
- **Keep Alive (`keep_alive`)** (Default: `5m`):
  - Controls how long the model stays loaded in VRAM after a request.
  - **Values**: `5m` (5 minutes), `1h` (1 hour), `-1` (Indefinitely).
  - **Impact**: Enables **Context Caching** in Ollama, speeding up subsequent requests significantly.
  - **Ollama only** - ignored by OpenAI-compatible servers.

### System Prompt

You can customize the **System Prompt** to change how the AI behaves. The default prompt is optimized for a helpful "AI Administrator" persona that prioritizes executing tools over chatting.

## Security

- **Permissions**: The AI Agent respects the permissions of the user invoking it. A user without "Hosts" permission cannot ask the AI to delete a host.
- **Encryption**: API Keys are stored **encrypted** (AES-256) in the database.
- **Audit**: All actions performed by the AI are logged in the **Audit Log** under the user's account, clearly marked as AI-initiated.
- **Strict tool schemas**: Unknown properties, oversized strings/arrays and invalid types are rejected before a tool runs.
- **Bounded execution**: One provider response can request at most 4 tools; a user turn allows at most 8 calls,
  2 mutations and 1 destructive action. Tool results are truncated at 32 KiB.
- **Explicit confirmation**: Destructive and security-sensitive actions require a short-lived, one-use HMAC confirmation
  bound to the authenticated actor, exact tool name, exact arguments and expiry. Rewording an action invalidates the approval.
- **Untrusted-data boundary**: After reading logs, audit records or analytics, the agent cannot mutate state in the same
  user turn. Start a fresh turn after reviewing the data.

These controls are enforced server-side; changing a system prompt cannot bypass them. Legacy tool aliases that exposed
dangerous actions without the same schema and confirmation contract are not available.
