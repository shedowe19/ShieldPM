import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { decrypt } from "../lib/encryption.js";
import { createIntegrationAccess } from "../lib/integration-access.js";
import { global as logger } from "../logger.js";
import ChatIntegrationModel from "../models/chat_integration.js";
import ai from "./ai.js";

const bots = {}; // Cache for bot instances: { integration_id: TelegrafInstance }

// Smart MarkdownV2 Escaper
// Escapes special characters OUTSIDE of code blocks, but preserves them INSIDE.
const smartEscape = (text) => {
	// Split by code blocks (backticks or triple backticks)
	const parts = text.split(/(`[^`]+`|```[\s\S]+?```)/g);
	return parts
		.map((part) => {
			// If it starts with a backtick, it's code. Don't escape standard chars.
			if (part.startsWith("`")) {
				return part; // Return code block as-is
			}
			// Escape special chars for MarkdownV2 OUTSIDE code blocks
			// Characters: _ * [ ] ( ) ~ > # + - = | { } . ! \ `
			// We use a single regex for efficiency. We only escape characters that have special meaning in regex if needed,
			// or just list them. Inside [], most don't need escaping.
			// \ and ] and - need care.
			return part.replace(/([_*[\]()~>#+\-=|{}.!\\`])/g, "\\$1");
		})
		.join("");
};

const internalChat = {
	/**
	 * Initialize all enabled chat integrations
	 */
	init: async () => {
		try {
			const integrations = await ChatIntegrationModel.query().where("enabled", 1).withGraphFetched("user");

			for (const integration of integrations) {
				await internalChat.startBot(integration);
			}
			logger.info(`[ChatOps] Initialized ${Object.keys(bots).length} bots.`);
		} catch (err) {
			logger.error("[ChatOps] Failed to initialize bots:", err);
		}
	},

	/**
	 * Start a specific bot instance
	 * @param {import("../models/chat_integration.js").default} integration
	 */
	startBot: async (integration) => {
		if (bots[integration.id]) {
			await internalChat.stopBot(integration.id);
		}

		if (!integration.enabled) return;

		try {
			const token = decrypt(integration.token);
			const bot = new Telegraf(token);

			// Middleware: Access Control
			bot.use(async (ctx, next) => {
				const userId = ctx.from?.id;
				if (!userId || ctx.chat?.type !== "private") {
					logger.warn("[ChatOps] Refused a non-private or unidentified Telegram principal");
					return; // Silently ignore unauthorized users
				}
				const integrationAccess = createIntegrationAccess(integration.id, userId);
				try {
					await integrationAccess.load();
				} catch (_err) {
					logger.warn("[ChatOps] Refused an unauthorized integration principal");
					return;
				}
				// @ts-expect-error: Custom property
				ctx.shieldAccess = integrationAccess;

				return next();
			});

			bot.on(message("text"), async (ctx) => {
				const message = ctx.message.text;
				if (!message) return;

				try {
					const sendTyping = async () => {
						try {
							await ctx.sendChatAction("typing");
						} catch (_e) {
							/* ignore */
						}
					};

					// Start typing loop
					await sendTyping();
					const typingInterval = setInterval(sendTyping, 4000); // Telegram status lasts ~5s

					let response;
					try {
						// @ts-expect-error: Custom shieldAccess property on context is not typed
						response = await ai.chat(ctx.shieldAccess, message, []);
					} finally {
						clearInterval(typingInterval);
					}

					// Send response
					if (response.content) {
						try {
							// Use smart escaping to handle MarkdownV2 safely
							const escapedContent = smartEscape(response.content);
							await ctx.reply(escapedContent, { parse_mode: "MarkdownV2" });
						} catch (sendErr) {
							// Check for markdown parse errors
							if (
								sendErr.message.includes("can't parse entities") ||
								sendErr.message.includes("Can't find end of the entity")
							) {
								logger.warn(
									`[ChatOps] Markdown send failed (${sendErr.message}), falling back to plain text.`,
								);
								await ctx.reply(response.content);
							} else {
								throw sendErr;
							}
						}
					} else {
						logger.warn("[ChatOps] AI returned empty content.");
						await ctx.reply("🤔 I processed your request but have nothing to say.");
					}
				} catch (err) {
					logger.error(
						`[ChatOps] Error handling message: ${err instanceof Error ? err.message : "Unknown error"}`,
					);
					await ctx.reply("❌ The request could not be processed safely.");
				}
			});

			// Global error handler for this bot
			bot.catch((err, ctx) => {
				logger.error(`[ChatOps] Bot ${integration.id} error for ${ctx.updateType}:`, err);
			});

			// Launch with explicit error handling
			bot.launch().catch((err) => {
				logger.error(`[ChatOps] Failed to launch bot ${integration.id}:`, err);
			});

			bots[integration.id] = bot;
			logger.info(`[ChatOps] Started Telegram bot for Integration ID ${integration.id}`);
		} catch (err) {
			logger.error(`[ChatOps] Failed to start bot ${integration.id}:`, err);
		}
	},

	/**
	 * Stop a bot instance
	 */
	stopBot: async (integrationId) => {
		if (bots[integrationId]) {
			try {
				bots[integrationId].stop();
				delete bots[integrationId];
			} catch (err) {
				logger.warn(`[ChatOps] Error stopping bot ${integrationId}:`, err);
			}
		}
	},

	stopAll: async () => {
		await Promise.allSettled(Object.keys(bots).map((integrationId) => internalChat.stopBot(integrationId)));
	},

	/**
	 * Reload a specific integration (after update)
	 */
	reload: async (integrationId) => {
		const integration = await ChatIntegrationModel.query().findById(integrationId);
		if (integration) {
			await internalChat.startBot(integration);
		} else {
			await internalChat.stopBot(integrationId);
		}
	},
};

export default internalChat;
