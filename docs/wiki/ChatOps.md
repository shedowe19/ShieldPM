# ChatOps (Telegram Bot)

ShieldPM includes a **ChatOps** integration that allows you to manage your server through a **Telegram Bot**. Messages sent to the bot are processed by the built-in [AI Agent](AI-Agent), giving you full administrative control from your phone or desktop via Telegram.

## Features

*   **Natural Language Management:** Send messages like "Create a proxy host for app.example.com pointing to 192.168.1.50:3000" and the AI Agent executes the task.
*   **Permission-Aware:** The Telegram bot inherits the permissions of the ShieldPM user who created the integration.
*   **Access Control:** Restrict which Telegram users can interact with the bot via allowed User IDs.
*   **Encrypted Tokens:** Bot tokens are stored using **AES-256-GCM** encryption.
*   **Markdown Support:** Responses are formatted with Telegram MarkdownV2 for readability.

## Setup

### 1. Create a Telegram Bot

1.  Open [Telegram](https://telegram.org/) and search for **@BotFather**.
2.  Send `/newbot` and follow the prompts to create your bot.
3.  **Copy the Bot Token** (e.g., `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`).

### 2. Find Your Telegram User ID

To restrict access to only your account:

1.  Search for **@userinfobot** on Telegram.
2.  Send it any message — it will reply with your **User ID** (a number like `12345678`).

### 3. Configure in ShieldPM

1.  Navigate to **ChatOps** in the sidebar.
2.  **Bot Token:** Paste the token from @BotFather.
3.  **Allowed User IDs:** Enter your Telegram User ID(s), comma-separated if multiple (e.g., `12345678, 87654321`).
4.  **Enabled:** Toggle on.
5.  Click **Save**.

The bot starts immediately and begins listening for messages.

## Usage Examples

Once configured, you can send messages to your bot like:

*   "List all proxy hosts"
*   "Create a proxy host for grafana.example.com → 192.168.1.10:3000 with SSL"
*   "Show me the last 50 nginx access logs"
*   "What's the system health?"
*   "Renew all certificates"

The AI Agent processes these requests using the same tools available in the web UI's AI chat.

## Security

*   **Unauthorized users are silently ignored** — they receive no response.
*   **Permissions are inherited** from the ShieldPM user who created the integration. A restricted user cannot perform admin actions via the bot.
*   **All actions are logged** in the Audit Log under the integration owner's account.

> [!WARNING]
> The Telegram Bot Token grants full access to your bot. Keep it private. If compromised, revoke it via @BotFather (`/revoke`) and create a new one.

## Troubleshooting

### Bot Not Responding
*   Verify the Bot Token is correct (create a new one via @BotFather if unsure).
*   Check that the **Enabled** toggle is on.
*   Confirm your Telegram User ID is in the **Allowed User IDs** list.
*   Check backend logs:
    ```bash
    # Docker
    docker compose logs -f shieldpm | grep "ChatOps"

    # Native / LXC
    journalctl -u shieldpm -f | grep "ChatOps"
    ```

### "Unauthorized access attempt" in Logs
A Telegram user not in your Allowed User IDs tried to message the bot. This is expected behavior — they are silently blocked.

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
