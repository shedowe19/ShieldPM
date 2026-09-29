# ChatOps (Telegram)

ChatOps connects a Telegram bot to ShieldPM's [AI Agent](AI-Agent). An enabled integration receives text messages through the backend's Telegraf polling client. Authorized messages are sent to the configured AI provider; structured tool calls use the permissions of the ShieldPM account that owns the integration.

The bot runs in the ShieldPM backend process and polls Telegram for messages. It handles text messages; other Telegram message types are not routed to the AI chat. The web UI can save, update, or delete the account's integration and masks the previously saved bot token rather than displaying it.

## Setup

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its token.
2. Get the numeric Telegram user IDs you want to authorize.
3. Configure and enable **Settings → AI Agent** first. ChatOps cannot process requests while the AI Agent is disabled.
4. Open **ChatOps**, enter the bot token, add the allowed Telegram IDs separated by commas, enable the integration, and save.

You can obtain your numeric Telegram ID from a Telegram ID bot or another trusted method. Enter user IDs rather than Telegram usernames; the allowlist compares each incoming sender ID as a string. The UI requires at least one ID before saving. Saving an enabled integration starts its bot; disabling or deleting it stops the polling client. Replacing the token restarts the integration with the new token.

The page currently edits the first Telegram integration belonging to your account. A missing allowlist denies all incoming users. A sender whose Telegram ID is not listed gets no reply; the backend writes an unauthorized-attempt warning to its logs.

The integration's token is encrypted in the database with AES-256-GCM. Access to the ChatOps configuration is governed by the owner's ChatOps permissions and ownership checks; integrations are not shared across accounts in the management API.

## Usage and access

For example, you can ask the bot to list proxy hosts or check traffic analytics if the integration owner has the corresponding permissions. The bot creates a short-lived, five-minute access token bound to that ShieldPM account for each accepted message. **Every Telegram ID on the allowlist acts with the same ShieldPM permissions as the integration owner**; IDs are not mapped to separate ShieldPM users.

Examples of requests that depend on the owner's permissions:

- “List my proxy hosts.”
- “Show the traffic summary.”
- “Create a proxy host for `app.example.com` pointing to `192.0.2.10:3000`.”
- “Check the Nginx configuration.”

The AI must return a structured tool call for a change to occur. An ordinary text reply alone does not perform an operation, and the provider can return an error or decline a request. Check the relevant ShieldPM page after a sensitive change.

Replies use escaped Telegram MarkdownV2 outside inline code and code blocks. If Telegram rejects the formatting, the bot retries as plain text. The backend also sends configured proxy-host monitoring state alerts as plain text to up to 50 distinct valid allowed IDs per matching enabled integration belonging to the host owner. A failed delivery is logged without preventing delivery to other recipients. Keep the bot token private and rotate it with BotFather if exposed.

Chat requests themselves are not guaranteed to appear as audit entries. Individual operations are recorded only where the underlying service writes an audit event. Errors and authorization failures are best investigated in backend logs and by checking the current state in ShieldPM.

## Troubleshooting

- Confirm that both the ChatOps integration and AI Agent are enabled and that the selected model and provider work.
- Check the bot token and the sender's numeric Telegram ID in the allowlist.
- Inspect backend logs (`docker compose logs -f shieldpm` for the corresponding Compose service, or `journalctl -u shieldpm -f` for a native installation) for `[ChatOps]` messages.
- If the bot starts but cannot answer a request, verify the AI provider model and that the integration owner can perform that action in ShieldPM. Use the UI to check whether an attempted change actually happened.
- When rotating the token, update it in ShieldPM and save. Telegram may need a moment to end the previous polling request and start the replacement instance.

[🏠 Home](Home) | [🤖 AI Agent](AI-Agent) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
