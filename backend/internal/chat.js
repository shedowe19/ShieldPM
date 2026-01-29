import jwt from "jsonwebtoken";
import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import access from "../lib/access.js";
import { getPrivateKey } from "../lib/config.js";
import { decrypt } from "../lib/encryption.js";
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
				const allowedIds = integration.config?.allowed_ids || [];

				// Check if user is allowed
				// allowed_ids store strings or numbers, so loose check is safer or cast to string
				const isAllowed = allowedIds.some((id) => String(id) === String(userId));

				if (!isAllowed) {
					logger.warn(`[ChatOps] Unauthorized access attempt from Telegram ID: ${userId}`);
					return; // Silently ignore unauthorized users
				}

				// Synthesize Access Object for this user
				// We load permissions based on the owner of the integration
				// This implies the chat user has the SAME permissions as the ShieldPM user who owns the bot

				// Mock Access Object
				// We can't easily get a real JWT token here, but internal functions generally need
				// an 'access' object with .can() method.
				// Solution: Use the internal Access logic but bound to the User ID.

				// However, `access.js` usually parses a token string.
				// We can create a "Internal" access object manually or use a helper.
				// For now, let's create a minimal compatible object.

				// Generate a temporary JWT for this user to reuse the access system
				const secret = /** @type {string} */ (getPrivateKey());
				const generatedToken = jwt.sign(
					{
						scope: ["user"],
						attrs: {
							id: integration.user_id,
						},
					},
					secret,
					{
						algorithm: "RS256",
						expiresIn: "5m",
					},
				);

				// Initialize REAL access control object
				// This ensures access.token is available for audit logs and prompts
				// @ts-expect-error: Custom property
				ctx.shieldAccess = new access(generatedToken);

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
					logger.error(`[ChatOps] Error handling message: ${err.message}`);
					await ctx.reply(`❌ Error processing request: ${err.message}`);
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
