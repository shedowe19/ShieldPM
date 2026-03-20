import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { decrypt } from "../../lib/encryption.js";
import { global as logger } from "../../logger.js";
import ChatIntegrationModel from "../../models/chat_integration.js";
import { aiService } from "../../modules/ai/index.js";
import { createShieldAccess, smartEscape } from "./helpers.js";
import { bots } from "./state.js";

const stopBot = async (integrationId) => {
	if (bots[integrationId]) {
		try {
			bots[integrationId].stop();
			delete bots[integrationId];
		} catch (err) {
			logger.warn(`[ChatOps] Error stopping bot ${integrationId}:`, err);
		}
	}
};

const startBot = async (integration) => {
	if (bots[integration.id]) await stopBot(integration.id);
	if (!integration.enabled) return;
	try {
		const token = decrypt(integration.token);
		const bot = new Telegraf(token);
		bot.use(async (ctx, next) => {
			const userId = ctx.from?.id;
			const allowedIds = integration.config?.allowed_ids || [];
			const isAllowed = allowedIds.some((id) => String(id) === String(userId));
			if (!isAllowed) {
				logger.warn(`[ChatOps] Unauthorized access attempt from Telegram ID: ${userId}`);
				return;
			}
			// @ts-expect-error custom context property
			ctx.shieldAccess = createShieldAccess(integration.user_id);
			return next();
		});
		bot.on(message("text"), async (ctx) => {
			const msg = ctx.message.text;
			if (!msg) return;
			try {
				const sendTyping = async () => {
					try { await ctx.sendChatAction("typing"); } catch {}
				};
				await sendTyping();
				const typingInterval = setInterval(sendTyping, 4000);
				let response;
				try {
					// @ts-expect-error custom context property
					response = await aiService.chat(ctx.shieldAccess, msg, []);
				} finally {
					clearInterval(typingInterval);
				}
				if (response.content) {
					try {
						await ctx.reply(smartEscape(response.content), { parse_mode: "MarkdownV2" });
					} catch (sendErr) {
						if (sendErr.message.includes("can't parse entities") || sendErr.message.includes("Can't find end of the entity")) {
							logger.warn(`[ChatOps] Markdown send failed (${sendErr.message}), falling back to plain text.`);
							await ctx.reply(response.content);
						} else throw sendErr;
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
		bot.catch((err, ctx) => {
			logger.error(`[ChatOps] Bot ${integration.id} error for ${ctx.updateType}:`, err);
		});
		bot.launch().catch((err) => {
			logger.error(`[ChatOps] Failed to launch bot ${integration.id}:`, err);
		});
		bots[integration.id] = bot;
		logger.info(`[ChatOps] Started Telegram bot for Integration ID ${integration.id}`);
	} catch (err) {
		logger.error(`[ChatOps] Failed to start bot ${integration.id}:`, err);
	}
};

const init = async () => {
	try {
		const integrations = await ChatIntegrationModel.query().where("enabled", 1).withGraphFetched("user");
		for (const integration of integrations) await startBot(integration);
		logger.info(`[ChatOps] Initialized ${Object.keys(bots).length} bots.`);
	} catch (err) {
		logger.error("[ChatOps] Failed to initialize bots:", err);
	}
};

const reload = async (integrationId) => {
	const integration = await ChatIntegrationModel.query().findById(integrationId);
	if (integration) await startBot(integration);
	else await stopBot(integrationId);
};

export default { init, startBot, stopBot, reload };
