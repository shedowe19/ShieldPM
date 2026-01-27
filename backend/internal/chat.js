import jwt from "jsonwebtoken";
import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import access from "../lib/access.js";
import { configGet } from "../lib/config.js";
import { decrypt } from "../lib/encryption.js";
import { global as logger } from "../logger.js";
import ChatIntegrationModel from "../models/chat_integration.js";
import ai from "./ai.js";

const bots = {}; // Cache for bot instances: { integration_id: TelegrafInstance }

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

				// @ts-expect-error: Adding custom shieldAccess property to context which is not in the type definition but required for internal logic
				ctx.shieldAccess = {
					can: async (permission, data) => {
						// Generate a temporary JWT for this user to reuse the access system
						const secret = configGet("jwt:secret");
						const generatedToken = jwt.sign(
							{
								scope: ["user"],
								id: integration.user_id,
							},
							secret,
							{ expiresIn: "5m" },
						);

						// Initialize access control with this token
						const acl = access(generatedToken);
						await acl.init();
						return acl.can(permission, data);
					},
				};

				return next();
			});

			bot.on(message("text"), async (ctx) => {
				const message = ctx.message.text;
				if (!message) return;

				// Show typing status
				await ctx.sendChatAction("typing");

				try {
					// Route to AI
					// We treat this as a new conversation for each message for now?
					// Or keep a small history? Telegram doesn't map easily to our history array.
					// Let's start with stateless execution (history=[]) or simple context.

					// Ideally we'd map ctx.chat.id to a conversation history in DB, but let's keep it simple first.

					// @ts-expect-error: Custom shieldAccess property on context is not typed
					const response = await ai.chat(ctx.shieldAccess, message, []);

					// Send response
					await ctx.reply(response.content, { parse_mode: "Markdown" });
				} catch (err) {
					logger.error(`[ChatOps] Error handling message: ${err.message}`);
					await ctx.reply(`❌ Error processing request: ${err.message}`);
				}
			});

			bot.launch();
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
