import { decrypt, encrypt } from "../lib/encryption.js";
import { global as logger } from "../logger.js";
import { executeTools } from "./ai/executor.js";
import { getSystemPrompt } from "./ai/prompt.js";
import * as aiProviders from "./ai/providers.js";
import { AI_LIMITS, createExecutionState, getToolEffect, readConfirmation, redactToolData } from "./ai/safety.js";
// Modular AI components (SRP refactoring)
import { getToolDefinitions } from "./ai/tools.js";
import internalSetting from "./setting.js";

const AI_CONFIG_ID = "ai-config";
const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_HISTORY_ITEMS = 20;
const MAX_HISTORY_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;

const boundedText = (value, maximumBytes, label) => {
	if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
	if (Buffer.byteLength(value, "utf8") > maximumBytes) throw new RangeError(`${label} exceeds the size limit`);
	return value;
};

const normalizeHistory = (history) => {
	if (!Array.isArray(history) || history.length > MAX_HISTORY_ITEMS) {
		throw new TypeError(`AI history must contain at most ${MAX_HISTORY_ITEMS} messages`);
	}
	let bytes = 0;
	return history.map((entry) => {
		if (!entry || typeof entry !== "object" || Array.isArray(entry))
			throw new TypeError("Invalid AI history entry");
		if (!["user", "assistant"].includes(entry.role)) throw new TypeError("Invalid AI history role");
		const content = boundedText(entry.content, MAX_MESSAGE_BYTES, "AI history content");
		bytes += Buffer.byteLength(content, "utf8");
		if (bytes > MAX_HISTORY_BYTES) throw new RangeError("AI history exceeds the total size limit");
		return { role: entry.role, content };
	});
};

const truncateResponse = (value) => {
	const buffer = Buffer.from(String(value || ""), "utf8");
	return buffer.length <= MAX_RESPONSE_BYTES
		? buffer.toString("utf8")
		: `${buffer.subarray(0, MAX_RESPONSE_BYTES).toString("utf8")}\n[TRUNCATED]`;
};

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
			// Only ignore "not found" errors — 404 means the setting doesn't exist yet
			// Any other error (DB, network, etc.) should be surfaced
			if (err.code !== 404) {
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
		const safeMessage = boundedText(message, MAX_MESSAGE_BYTES, "AI message");
		const safeHistory = normalizeHistory(history);
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
		const tools = await getToolDefinitions(access);

		logger.info("[AI Chat] Calling LLM:", {
			provider: config.provider,
			messageLength: safeMessage.length,
			toolsCount: tools.length,
		});

		// 3. Call Provider
		let response;
		if (config.provider === "gemini") {
			response = await aiProviders.callGemini(config, systemPrompt, safeMessage, safeHistory, tools);
		} else {
			response = await aiProviders.callLocalLLM(config, systemPrompt, safeMessage, safeHistory, tools);
		}

		logger.info("[AI Chat] LLM Response:", {
			hasContent: !!response.content,
			hasToolCalls: !!response.toolCalls,
			contentLength: response.content?.length || 0,
		});

		// 4. Handle Tool Calls
		// 4. Handle Tool Calls (Recursive Loop)
		let iterations = 0;
		const MAX_ITERATIONS = AI_LIMITS.maxLoops;
		let wasToolExecuted = false; // Track if ANY tool was executed in this chain
		const executionState = createExecutionState();

		while (response.toolCalls && response.toolCalls.length > 0 && iterations < MAX_ITERATIONS) {
			iterations++;
			logger.info(
				`[AI Chat] Executing tools (Turn ${iterations}):`,
				response.toolCalls.map((tc) => tc.name),
			);
			const toolResults = await executeTools(access, response.toolCalls, { state: executionState, tools });
			const pendingConfirmation = toolResults.find((result) => result.confirmation);
			if (pendingConfirmation) {
				return {
					role: "assistant",
					content: `Confirmation required for ${pendingConfirmation.confirmation.tool}. Review and approve this exact action.`,
					confirmation: pendingConfirmation.confirmation,
				};
			}
			wasToolExecuted = true;

			logger.info(
				`[AI Chat] Tool results (Turn ${iterations}):`,
				toolResults.map((tr) => ({ name: tr.name, resultLength: tr.result?.length || 0 })),
			);

			// Call LLM again with results
			if (config.provider === "gemini") {
				response = await aiProviders.callGeminiWithResults(
					config,
					systemPrompt,
					safeMessage,
					safeHistory,
					response,
					toolResults,
					tools,
				);
			} else {
				response = await aiProviders.callLocalWithResults(
					config,
					systemPrompt,
					safeMessage,
					safeHistory,
					response,
					toolResults,
				);
			}

			logger.info(`[AI Chat] LLM Response (Turn ${iterations}):`, {
				hasContent: !!response.content,
				hasToolCalls: !!response.toolCalls,
				contentLength: response.content?.length || 0,
			});
		}

		logger.debug("[AI Chat] Returning response:", {
			role: "assistant",
			contentLength: response.content?.length || 0,
		});

		// HALLUCINATION DETECTION: Warn if AI claims action but no tool was called
		let finalContent = truncateResponse(/** @type {string} */ (redactToolData(response.content || "")));
		if (iterations >= MAX_ITERATIONS && response.toolCalls?.length) {
			finalContent = "The tool-loop safety limit was reached. No additional actions were executed.";
		}
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

		// Filter out <think> blocks from final content
		if (finalContent) {
			// Remove <think>...</think> blocks (dotAll to handle newlines)
			finalContent = finalContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
			// Also remove <toolcall> or <tool_call> blocks if any remain (just in case)
			finalContent = finalContent.replace(/<tool_?call>[\s\S]*?<\/tool_?call>/gi, "").trim();
		}

		// Fail-safe: If content is empty but tools were executed, provide a default status
		if (!finalContent && wasToolExecuted) {
			finalContent = "Tool processing ended without a final provider response. Verify the individual results.";
		}

		// HALLUCINATION DETECTION: Warn if AI claims action but no tool was called
		// Use the persistent flag, not just the final response state
		const toolsExecuted = wasToolExecuted || (response.toolCalls && response.toolCalls.length > 0);

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

	/**
	 * Execute an exact HMAC-bound action after an explicit UI/API confirmation.
	 * The provider never receives the token and is not called again.
	 *
	 * @param {import("../lib/types.js").Access} access
	 * @param {string} token
	 */
	confirm: async (access, token) => {
		const pending = readConfirmation(access, token);
		if (!pending || getToolEffect(pending.name) !== "destructive") {
			throw new TypeError("Invalid or expired AI confirmation");
		}
		const tools = await getToolDefinitions(access);
		const [result] = await executeTools(
			access,
			[{ id: `confirmed-${pending.nonce}`, name: pending.name, args: pending.args }],
			{ state: createExecutionState(), tools, confirmationToken: token },
		);
		if (!result || result.confirmation) throw new TypeError("AI confirmation could not be consumed");
		if (result.result.startsWith("Error: ")) throw new Error(result.result.slice("Error: ".length));
		return { role: "assistant", content: truncateResponse(result.result) };
	},
};

export default ai;
