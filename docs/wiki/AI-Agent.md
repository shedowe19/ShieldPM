# AI Agent (Administrator)

**NPMplus v3.1.0** introduces a powerful embedded AI Agent that acts as a co-administrator for your server.

![AI Agent Interface](/images/wiki/ai-chat.png)

## Features

The AI Agent is not just a chatbot; it has direct access to the NPMplus internals and can perform the following actions for you:

*   **Proxy Hosts**: Create, Update, Delete, Enable, Disable, List.
*   **Security**: Manage Access Lists (including mTLS), Create/Renew Certificates.
*   **System**: Check System Status (CPU, Network), Read Nginx Logs, Reboot Nginx.
*   **Analytics**: Summarize traffic data.
*   **User Management**: Create/Update users, Reset passwords.

## Configuration

To enable the AI Agent, go to **Settings** -> **AI Agent**.

### Providers

You can choose between two backend providers:

1.  **Google Gemini** (Cloud)
    *   Requires a valid API Key from [Google AI Studio](https://aistudio.google.com/).
    *   **Model**: Defaults to `gemini-1.5-flash`, but can be changed to `gemini-1.5-pro` etc.

2.  **Local LLM / OpenAI Compatible** (Self-Hosted)
    *   Connects to any OpenAI-compatible API (e.g., Ollama, LocalAI, LM Studio).
    *   **Base URL**: e.g., `http://localhost:11434`
    *   **Model**: e.g., `llama3`, `mistral`.

### Fetch Models
Use the **"Fetch Models"** button in the settings to automatically list all available models from your chosen provider.

## Security

*   The AI Agent respects the permissions of the user invoking it.
*   API Keys are stored **encrypted** in the database.
*   Actions are logged in the **Audit Log**.
