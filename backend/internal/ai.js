import { decrypt, encrypt } from "../lib/encryption.js";
import { global as logger } from "../logger.js";
import { executeTools } from "./ai/executor.js";
import { getSystemPrompt } from "./ai/prompt.js";
import * as aiProviders from "./ai/providers.js";
// Modular AI components (SRP refactoring)
import { getToolDefinitions } from "./ai/tools.js";
import internalSetting from "./setting.js";

const AI_CONFIG_ID = "ai-config";

/**
 * AI Service for handling Chat and Tool Execution
 */
const ai = {
	/**
	 * Get the current AI Configuration
	 * @param {import("../lib/types.js").Access} access
	 */
	getConfig: async (access) => {
		// Verify permissions (admin only for config)
		await access.can("settings:list");
		try {
			const row = await internalSetting.get(access, { id: AI_CONFIG_ID });
			const meta = row.meta;
			if (meta.api_key) {
				try {
					meta.api_key = decrypt(meta.api_key);
				} catch (_err) {
					// Ignore decryption error
				}
			}
			// Ensure defaults exist
			if (!meta.num_ctx) meta.num_ctx = 8192;
			if (!meta.num_batch) meta.num_batch = 512;
			if (!meta.num_thread) meta.num_thread = 4;
			if (!meta.keep_alive) meta.keep_alive = "5m";
			return meta;
		} catch (_err) {
			// Return default config if not found
			return {
				enabled: false,
				provider: "gemini",
				api_key: "",
				base_url: "",
				model: "",
				num_ctx: 8192,
				num_batch: 512,
				num_thread: 4,
				keep_alive: "5m",
			};
		}
	},

	/**
	 * Get AI Config for chat (internal, no admin permission required)
	 * This is used by the chat function so all authenticated users can chat
	 */
	_getConfigForChat: async () => {
		try {
			const SettingModel = (await import("../models/setting.js")).default;
			const row = await SettingModel.query().where("id", AI_CONFIG_ID).first();
			if (!row) {
				return { enabled: false };
			}
			const meta = row.meta;
			if (meta.api_key) {
				try {
					meta.api_key = decrypt(meta.api_key);
				} catch (_err) {
					// Ignore decryption error
				}
			}
			// Ensure defaults exist
			if (!meta.num_ctx) meta.num_ctx = 8192;
			if (!meta.num_batch) meta.num_batch = 512;
			if (!meta.num_thread) meta.num_thread = 4;
			if (!meta.keep_alive) meta.keep_alive = "5m";
			return meta;
		} catch (_err) {
			return { enabled: false };
		}
	},

	/**
	 * Update AI Configuration
	 * @param {import("../lib/types.js").Access} access
	 * @param {Object} data
	 */
	setConfig: async (access, data) => {
		await access.can("settings:update", AI_CONFIG_ID);

		const dataToSave = { ...data };
		if (dataToSave.api_key) {
			dataToSave.api_key = encrypt(dataToSave.api_key);
		}

		// Check if setting exists, or create if not
		let exists = false;
		try {
			await internalSetting.get(access, { id: AI_CONFIG_ID });
			exists = true;
		} catch (err) {
			if (err.code !== 404 && err.message !== AI_CONFIG_ID) {
				// Rethrow if it's not a "Not Found" error
				throw err;
			}
		}

		if (exists) {
			// Update
			await internalSetting.update(
				access,
				/** @type {any} */ ({
					id: AI_CONFIG_ID,
					description: "AI Agent Configuration",
					value: data.enabled ? "true" : "false",
					meta: dataToSave,
				}),
			);
		} else {
			// Insert
			const SettingModel = (await import("../models/setting.js")).default;
			await SettingModel.query().insert({
				id: AI_CONFIG_ID,
				name: AI_CONFIG_ID,
				description: "AI Agent Configuration",
				value: data.enabled ? "true" : "false",
				meta: dataToSave,
			});
		}

		// Return original data to user (unencrypted)
		return data;
	},

	/**
	 * Get Models from Provider
	 * @param {import("../lib/types.js").Access} access
	 * @param {Object} config
	 */
	getModels: async (access, config) => {
		await access.can("settings:list");

		if (config.provider === "gemini") {
			if (!config.api_key) throw new Error("API Key is required");
			const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${config.api_key}`;
			try {
				const res = await fetch(url);
				if (!res.ok) throw new Error(`Gemini Error: ${res.status} ${res.statusText}`);
				const data = await res.json();
				return (data.models || [])
					.filter((m) => m.name.includes("gemini"))
					.map((m) => ({
						id: m.name.replace("models/", ""),
						name: m.displayName || m.name,
					}))
					.sort((a, b) => b.id.localeCompare(a.id));
			} catch (err) {
				throw new Error(`Failed to fetch Gemini models: ${err.message}`);
			}
		} else {
			// Local / OpenAI
			const baseUrl = config.base_url || "http://localhost:11434";

			let targetUrl;
			try {
				// Parse and validate base URL
				const parsedBase = new URL(baseUrl);

				// Security check: Only allow HTTP/HTTPS
				if (!["http:", "https:"].includes(parsedBase.protocol)) {
					throw new Error("Only HTTP/HTTPS protocols are allowed for base_url");
				}

				// Safely construct the final URL using URL constructor
				// This handles slash consistency and prevents some path traversal issues
				targetUrl = new URL("v1/models", parsedBase);
			} catch (err) {
				throw new Error(`Invalid base_url: ${err.message}`);
			}

			try {
				const headers = {};
				if (config.api_key) headers.Authorization = `Bearer ${config.api_key}`;

				const res = await fetch(targetUrl.toString(), { headers: /** @type {any} */ (headers) });
				if (!res.ok) throw new Error(`Local Provider Error: ${res.status} ${res.statusText}`);
				const data = await res.json();
				return (data.data || [])
					.map((m) => ({
						id: m.id,
						name: m.id,
					}))
					.sort((a, b) => a.id.localeCompare(b.id));
			} catch (err) {
				throw new Error(`Failed to fetch Local models: ${err.message}`);
			}
		}
	},

	/**
	 * Main Chat Entry point
	 * @param {import("../lib/types.js").Access} access
	 * @param {String} message
	 * @param {Array} history
	 */
	chat: async (access, message, history = []) => {
		// 1. Get Config (using internal method that doesn't require admin permission)
		const config = await ai._getConfigForChat();
		if (!config.enabled) {
			throw new Error("AI Agent is disabled.");
		}

		logger.debug("[DEBUG] AI Chat Config:", {
			provider: config.provider,
			model: config.model,
			baseUrl: config.base_url,
		});

		// FAIL-SAFE: If switching providers left a Gemini model name, clear it for Local
		if (config.provider === "local" && config.model && config.model.includes("gemini")) {
			// Logs for debugging
			logger.warn(`[AI] Sanitzing model for Local provider. Invalid model: ${config.model}`);
			config.model = ""; // Will fallback to default in _callLocalLLM
		}

		// Mark access as AI-initiated for Audit Log
		access.is_ai = true;

		// 2. Prepare System Prompt & Tools (from modular components)
		const systemPrompt = getSystemPrompt(config);
		const tools = getToolDefinitions();

		logger.info("[AI Chat] Calling LLM:", {
			provider: config.provider,
			messageLength: message.length,
			toolsCount: tools.length,
		});

		// 3. Call Provider
		let response;
		if (config.provider === "gemini") {
			response = await aiProviders.callGemini(config, systemPrompt, message, history, tools);
		} else {
			response = await aiProviders.callLocalLLM(config, systemPrompt, message, history, tools);
		}

		logger.info("[AI Chat] LLM Response:", {
			hasContent: !!response.content,
			hasToolCalls: !!response.toolCalls,
			contentLength: response.content?.length || 0,
		});

		// FALLBACK: Detect tool calls embedded in text response (small models sometimes output JSON as text)
		if ((!response.toolCalls || response.toolCalls.length === 0) && response.content) {
			const toolCallPatterns = [
				// Pattern 1: {"name": "tool_name", "arguments": {...}}
				/\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[^}]+\})\s*\}/g,
				// Pattern 2: function call format
				/(\w+_\w+)\s*\(\s*(\{[^}]*\}|\s*)\s*\)/g,
			];

			for (const pattern of toolCallPatterns) {
				const matches = [...response.content.matchAll(pattern)];
				if (matches.length > 0) {
					logger.warn("[AI Chat] FALLBACK: Detected tool call in text response, extracting...");
					response.toolCalls = response.toolCalls || [];
					for (const match of matches) {
						try {
							const toolName = match[1];
							const argsStr = match[2] || "{}";
							const args = JSON.parse(argsStr.replace(/'/g, '"'));
							response.toolCalls.push({ name: toolName, args });
							logger.info(`[AI Chat] FALLBACK: Extracted tool call: ${toolName}`, args);
						} catch (e) {
							logger.warn("[AI Chat] FALLBACK: Failed to parse embedded tool call:", e.message);
						}
					}
					// Clear the text content since we extracted tool calls
					if (response.toolCalls.length > 0) {
						response.content = "";
					}
					break;
				}
			}
		}

		// 4. Handle Tool Calls
		if (response.toolCalls && response.toolCalls.length > 0) {
			logger.info(
				"[AI Chat] Executing tools:",
				response.toolCalls.map((tc) => tc.name),
			);
			const toolResults = await executeTools(access, response.toolCalls);

			logger.info(
				"[AI Chat] Tool results:",
				toolResults.map((tr) => ({ name: tr.name, resultLength: tr.result?.length || 0 })),
			);

			// Call LLM again with results
			if (config.provider === "gemini") {
				return await aiProviders.callGeminiWithResults(
					config,
					systemPrompt,
					message,
					history,
					response,
					toolResults,
					tools,
				);
			}
			return await aiProviders.callLocalWithResults(
				config,
				systemPrompt,
				message,
				history,
				response,
				toolResults,
			);
		}

		logger.debug("[AI Chat] Returning response:", {
			role: "assistant",
			contentLength: response.content?.length || 0,
		});

		// HALLUCINATION DETECTION: Warn if AI claims action but no tool was called
		let finalContent = response.content || "";
		const actionWords = [
			// German
			/gelöscht/i,
			/erstellt/i,
			/aktiviert/i,
			/deaktiviert/i,
			/aktualisiert/i,
			// English
			/deleted/i,
			/created/i,
			/enabled/i,
			/disabled/i,
			/updated/i,
			/removed/i,
			/added/i,
		];
		const toolsExecuted = response.toolCalls && response.toolCalls.length > 0;

		if (!toolsExecuted && finalContent) {
			const claimsAction = actionWords.some((pattern) => pattern.test(finalContent));
			if (claimsAction) {
				logger.warn("[AI Chat] WARNING: AI claims action but no tool was executed!");
				finalContent = `⚠️ WARNING: The AI claims to have performed an action, but no tool was executed. Please verify manually!\n\n---\n\n${finalContent}`;
			}
		}

		return {
			role: "assistant",
			content: finalContent,
		};
	},
};

export default ai;
