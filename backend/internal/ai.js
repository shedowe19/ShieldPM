import { randomUUID } from "node:crypto";
import { decrypt, encrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
import { global as logger } from "../logger.js";
import { isReadOnlyTool, toPendingTool } from "./ai/confirmation.js";
import { executeTools } from "./ai/executor.js";
import { buildHallucinationWarning, findUnverifiedClaims } from "./ai/guard.js";
import { getSystemPrompt, wrapUntrustedData } from "./ai/prompt.js";
import * as aiProviders from "./ai/providers.js";
// Modular AI components (SRP refactoring)
import { getToolDefinitions } from "./ai/tools.js";
import { addDailyTokenUsage, getDailyBudget, getDailyTokenUsage } from "./ai/usage.js";
import { prepareToolCalls } from "./ai/validation.js";
import internalSetting from "./setting.js";

const AI_CONFIG_ID = "ai-config";
const MAX_HISTORY_ITEMS = 50;
const MAX_HISTORY_CHARS = 8000;
const MAX_TOOL_ROUNDS = 8;

const CONFIG_DEFAULTS = {
	num_ctx: 8192,
	num_batch: 512,
	num_thread: 4,
	keep_alive: "5m",
	timeout_ms: 60000,
	max_output_tokens: 2048,
	max_retries: 2,
	retry_delay_ms: 200,
	daily_token_budget: 0,
	fallback_provider: "",
	fallback_model: "",
	fallback_base_url: "",
};

const withDefaults = (meta) => {
	const result = { ...meta };
	for (const [key, value] of Object.entries(CONFIG_DEFAULTS)) {
		if (result[key] === undefined || result[key] === null || result[key] === "") result[key] = value;
	}
	return result;
};

const userIdOf = (access) => {
	try {
		return access?.token?.getUserId?.(1) ?? 0;
	} catch (_err) {
		return 0;
	}
};

const sanitizeHistory = (history) =>
	(Array.isArray(history) ? history : [])
		.filter((entry) => entry && typeof entry.content === "string" && entry.content.trim().length > 0)
		.slice(-MAX_HISTORY_ITEMS)
		.map((entry) => ({
			// A client supplied "model" turn is an assistant turn, never a user turn.
			role: entry.role === "user" ? "user" : "assistant",
			content: entry.content.slice(0, MAX_HISTORY_CHARS),
		}));

const resolveFallbackConfig = (config) => {
	const provider = config?.fallback_provider;
	if (!provider || provider === config.provider) return null;
	if (!["gemini", "local"].includes(provider)) return null;
	const fallback = {
		...config,
		provider,
		model: config.fallback_model || (provider === "gemini" ? aiProviders.DEFAULT_MODEL : config.model),
	};
	if (config.fallback_base_url) fallback.base_url = config.fallback_base_url;
	if (provider === "gemini" && !fallback.api_key) return null;
	if (provider === "local" && !fallback.base_url) return null;
	return fallback;
};

const isErrorResult = (result) => typeof result === "string" && /^\s*error:/i.test(result);

const stableValue = (value) => {
	if (Array.isArray(value)) return value.map(stableValue);
	if (value && typeof value === "object") {
		return Object.keys(value)
			.sort()
			.reduce((acc, key) => {
				acc[key] = stableValue(value[key]);
				return acc;
			}, {});
	}
	return value;
};

const canonicalPlan = (calls) =>
	JSON.stringify(
		(Array.isArray(calls) ? calls : [])
			.map((call) => ({ name: String(call?.name || ""), args: stableValue(call?.args || {}) }))
			.sort((a, b) => `${a.name}${JSON.stringify(a.args)}`.localeCompare(`${b.name}${JSON.stringify(b.args)}`)),
	);

const plansMatch = (calls, approved) => canonicalPlan(calls) === canonicalPlan(approved);

const buildToolSummary = (actions) => {
	if (!actions || actions.length === 0) {
		return "Tool processing finished without a final response. No state-changing tool ran.";
	}
	const lines = actions.map(
		(action) => `- ${action.tool}: ${action.status}${action.object_id ? ` (ID ${action.object_id})` : ""}`,
	);
	return `Tool processing finished without a final response. Recorded tool calls:\n${lines.join("\n")}`;
};

const emptyUsage = () => ({ input_tokens: 0, output_tokens: 0, total_tokens: 0, requests: 0 });

const addUsage = (total, response) => {
	const usage = response?.usage || {};
	total.input_tokens += Number(usage.input_tokens) || 0;
	total.output_tokens += Number(usage.output_tokens) || 0;
	total.total_tokens += Number(usage.total_tokens) || 0;
	total.requests += 1;
	return total;
};

const budgetExceeded = (config, userId) => {
	const budget = getDailyBudget(config);
	return budget > 0 && getDailyTokenUsage(userId) >= budget;
};

const budgetError = (config) => {
	const budget = getDailyBudget(config);
	const error = new errs.ConfigurationError(
		`The daily AI token budget of ${budget} tokens is exhausted. No further AI request was sent. ` +
			"Increase the budget in the AI settings or try again tomorrow.",
	);
	error.status = 429;
	/** @type {any} */ (error).code = "AI_BUDGET_EXCEEDED";
	return error;
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
			return withDefaults(meta);
		} catch (err) {
			if (err.status !== 404 && err.code !== 404) throw err;
			// Return default config if not found
			return withDefaults({
				enabled: false,
				provider: "gemini",
				api_key: "",
				base_url: "",
				model: "",
			});
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
				return withDefaults({ enabled: false });
			}
			const meta = row.meta;
			if (meta.api_key) {
				try {
					meta.api_key = decrypt(meta.api_key);
				} catch (_err) {
					// Ignore decryption error
				}
			}
			return withDefaults(meta);
		} catch (_err) {
			return withDefaults({ enabled: false });
		}
	},

	/**
	 * Update AI Configuration
	 * Preserves configuration keys the caller does not send (budgets,
	 * fallback, transport limits).
	 * @param {import("../lib/types.js").Access} access
	 * @param {Object} data
	 */
	setConfig: async (access, data) => {
		await access.can("settings:update", AI_CONFIG_ID);

		let existingMeta = {};
		let exists = false;
		try {
			const row = await internalSetting.get(access, { id: AI_CONFIG_ID });
			exists = true;
			existingMeta = row.meta || {};
		} catch (err) {
			// Only ignore "not found" errors — 404 means the setting doesn't exist yet
			// Any other error (DB, network, etc.) should be surfaced
			if (err.status !== 404 && err.code !== 404) {
				throw err;
			}
		}

		// Keep the stored (encrypted) key when the caller does not send a new one.
		const dataToSave = { ...existingMeta, ...data };
		if (data.api_key === "********") {
			// A redacted form was round-tripped: keep the stored secret.
			dataToSave.api_key = existingMeta.api_key ?? "";
		} else if (typeof data.api_key === "string" && data.api_key.length > 0) {
			dataToSave.api_key = encrypt(data.api_key);
		} else if (data.api_key === "") {
			dataToSave.api_key = "";
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
			if (!config.api_key) throw new errs.ConfigurationError("API Key is required");
			const url = "https://generativelanguage.googleapis.com/v1beta/models";
			try {
				const res = await fetch(url, {
					headers: { "x-goog-api-key": config.api_key },
					signal: AbortSignal.timeout(10000),
				});
				if (!res.ok)
					throw new errs.InternalError(`Gemini Error: ${res.status}`, {
						status: res.status,
						statusText: res.statusText,
					});
				const data = await res.json();
				return (data.models || [])
					.filter(
						(m) =>
							m.name.includes("gemini") &&
							(!Array.isArray(m.supportedGenerationMethods) ||
								m.supportedGenerationMethods.includes("generateContent")),
					)
					.map((m) => ({
						id: m.name.replace("models/", ""),
						name: m.displayName || m.name,
					}))
					.sort((a, b) => b.id.localeCompare(a.id));
			} catch (err) {
				throw new errs.InternalError("Failed to fetch Gemini models", err);
			}
		} else {
			// Local / OpenAI
			const baseUrl = config.base_url || "http://localhost:11434";

			let targetUrl;
			try {
				// Safely construct the final URL using URL constructor
				// This handles slash consistency and prevents some path traversal issues
				targetUrl = aiProviders.getLocalEndpoint(baseUrl, "v1/models");
			} catch (err) {
				throw new errs.ConfigurationError("Invalid base_url", err);
			}

			try {
				const headers = {};
				if (config.api_key) headers.Authorization = `Bearer ${config.api_key}`;

				const res = await fetch(targetUrl.toString(), {
					headers: /** @type {any} */ (headers),
					signal: AbortSignal.timeout(10000),
				});
				if (!res.ok)
					throw new errs.InternalError(`Local Provider Error: ${res.status}`, {
						status: res.status,
						statusText: res.statusText,
					});
				const data = await res.json();
				return (data.data || [])
					.map((m) => ({
						id: m.id,
						name: m.id,
					}))
					.sort((a, b) => a.id.localeCompare(b.id));
			} catch (err) {
				throw new errs.InternalError("Failed to fetch Local models", err);
			}
		}
	},

	/**
	 * Main Chat Entry point
	 *
	 * State-changing tools are never executed without an explicit confirmation
	 * from the client. The first response lists the planned tools; a second
	 * request with `confirm: true` and the same plan executes exactly those
	 * calls. Read-only tools run immediately.
	 *
	 * @param {import("../lib/types.js").Access} access
	 * @param {String} message
	 * @param {Array} history
	 * @param {{confirm?: boolean, pendingTools?: Array, readOnly?: boolean, signal?: AbortSignal, requestId?: string}} [options]
	 */
	chat: async (access, message, history = [], options = {}) => {
		// 1. Get Config (using internal method that doesn't require admin permission)
		const config = await ai._getConfigForChat();
		if (!config.enabled) {
			throw new errs.ConfigurationError("AI Agent is disabled.");
		}
		if (typeof message !== "string" || message.trim().length === 0) {
			throw new errs.ValidationError("Message is required.");
		}
		if (options.signal?.aborted) throw new errs.ValidationError("AI request cancelled.");

		const requestId = options.requestId || randomUUID();
		const userId = userIdOf(access);
		const readOnly = options.readOnly === true;
		const approvedPlan = Array.isArray(options.pendingTools) ? options.pendingTools : [];
		let approvalPending = options.confirm === true && approvedPlan.length > 0;

		// Budget is checked before any provider call; never run silently past it.
		if (budgetExceeded(config, userId)) throw budgetError(config);

		// Mark access as AI-initiated for Audit Log
		access.is_ai = true;

		// 2. Prepare System Prompt & Tools (from modular components)
		const systemPrompt = getSystemPrompt(config);
		const tools = await getToolDefinitions(access, { readOnly });
		const safeHistory = sanitizeHistory(history);
		// Normalize the approved plan through the same schema before comparing it
		// with a fresh model response, so type coercion cannot cause a retry loop.
		const approvedCalls = approvalPending ? prepareToolCalls(tools, approvedPlan, { readOnly }).calls : [];

		logger.info("[AI Chat] Calling LLM:", {
			request_id: requestId,
			user_id: userId,
			provider: config.provider,
			model: config.model,
			messageLength: message.length,
			toolsCount: tools.length,
			readOnly,
		});

		const callProvider = async (providerConfig, previousResponse, toolResults) => {
			const providerOptions = { signal: options.signal };
			if (providerConfig.provider === "gemini") {
				return previousResponse
					? aiProviders.callGeminiWithResults(
							providerConfig,
							systemPrompt,
							message,
							safeHistory,
							previousResponse,
							toolResults,
							tools,
							providerOptions,
						)
					: aiProviders.callGemini(
							providerConfig,
							systemPrompt,
							message,
							safeHistory,
							tools,
							providerOptions,
						);
			}
			return previousResponse
				? aiProviders.callLocalWithResults(
						providerConfig,
						systemPrompt,
						message,
						safeHistory,
						previousResponse,
						toolResults,
						tools,
						providerOptions,
					)
				: aiProviders.callLocalLLM(providerConfig, systemPrompt, message, safeHistory, tools, providerOptions);
		};

		// 3. Call Provider - one configured fallback for the initial request.
		let activeConfig = config;
		let response;
		const startedAt = Date.now();
		try {
			response = await callProvider(config, null, null);
		} catch (err) {
			const fallback = resolveFallbackConfig(config);
			if (!fallback) throw err;
			logger.warn(
				`[AI Chat] Primary provider ${config.provider} failed (${err.public ? err.message : "internal error"}); using fallback ${fallback.provider}`,
			);
			activeConfig = fallback;
			response = await callProvider(fallback, null, null);
		}

		const usage = emptyUsage();
		const actionLog = [];
		let iterations = 0;
		const maxRounds = Math.min(12, Math.max(1, Number(config.max_tool_rounds) || MAX_TOOL_ROUNDS));
		let degraded = false;

		const logUsage = (currentResponse, round) => {
			addUsage(usage, currentResponse);
			addDailyTokenUsage(userId, currentResponse?.usage?.total_tokens || 0);
			logger.info("[AI Usage]", {
				request_id: requestId,
				user_id: userId,
				provider: currentResponse?.provider || activeConfig.provider,
				model: currentResponse?.model || activeConfig.model,
				input_tokens: currentResponse?.usage?.input_tokens || 0,
				output_tokens: currentResponse?.usage?.output_tokens || 0,
				total_tokens: currentResponse?.usage?.total_tokens || 0,
				round,
				latency_ms: Date.now() - startedAt,
				outcome: "ok",
			});
		};

		// 4. Tool loop
		for (;;) {
			logUsage(response, iterations);
			const toolCalls = Array.isArray(response?.toolCalls) ? response.toolCalls : [];
			if (toolCalls.length === 0) break;
			if (iterations >= maxRounds) {
				degraded = true;
				logger.warn(`[AI Chat] Tool round limit (${maxRounds}) reached for request ${requestId}`);
				break;
			}
			iterations++;

			// Confirmation gate. Read-only tools are exempt; every other tool
			// needs a matching approved plan from the client.
			const { calls, rejected } = prepareToolCalls(tools, toolCalls, { readOnly });
			const pendingMutations = calls.filter((call) => !isReadOnlyTool(call.name));
			if (pendingMutations.length > 0 && !readOnly) {
				if (!approvalPending || !plansMatch(pendingMutations, approvedCalls)) {
					const pendingTools = pendingMutations.map(toPendingTool);
					return {
						role: "assistant",
						content:
							response?.content ||
							`Confirmation required before executing: ${pendingTools.map((tool) => tool.name).join(", ")}`,
						requires_confirmation: true,
						pending_tools: pendingTools,
						actions: actionLog,
						usage,
					};
				}
				// One approval authorizes exactly one batch of planned calls.
				approvalPending = false;
			}

			const executed =
				calls.length > 0 ? await executeTools(access, calls, { toolDefinitions: tools, readOnly }) : [];
			const results = [...executed, ...rejected];

			const callsById = new Map(calls.map((call) => [call.id, call]));
			for (const result of results) {
				const call = callsById.get(result.toolCallId);
				const args = call?.args || {};
				actionLog.push({
					tool: result.name,
					status: isErrorResult(result.result) ? "error" : "success",
					object_id: args.id ?? args.host_id ?? args.proxy_host_id ?? null,
					round: iterations,
				});
			}

			logger.info(`[AI Chat] Tool results (Turn ${iterations}):`, {
				request_id: requestId,
				results: results.map((result) => ({
					name: result.name,
					status: isErrorResult(result.result) ? "error" : "success",
				})),
			});

			if (budgetExceeded(config, userId)) {
				return {
					role: "assistant",
					content:
						`${budgetError(config).message}\n\nThe following tool calls were executed before the stop:\n` +
						buildToolSummary(actionLog),
					actions: actionLog,
					usage,
					degraded: true,
				};
			}

			const safeResults = results.map((result) => ({
				...result,
				result: wrapUntrustedData(result.name, result.result),
			}));

			try {
				response = await callProvider(activeConfig, response, safeResults);
			} catch (err) {
				degraded = true;
				logger.warn(
					`[AI Chat] Provider failed after tool execution for request ${requestId}: ${
						err.public ? err.message : "internal error"
					}`,
				);
				return {
					role: "assistant",
					content: `${buildToolSummary(actionLog)}\n\nThe AI provider failed afterwards: ${
						err.public ? err.message : "Internal Error"
					}`,
					actions: actionLog,
					usage,
					degraded: true,
				};
			}
		}

		logger.debug("[AI Chat] Returning response:", {
			request_id: requestId,
			role: "assistant",
			contentLength: response?.content?.length || 0,
		});

		let finalContent = response?.content || "";
		if (!finalContent && actionLog.length > 0) {
			finalContent = buildToolSummary(actionLog);
		} else if (!finalContent) {
			finalContent = "The AI returned no response.";
		}

		// Hallucination guard: the claim must be backed by a matching successful tool.
		const unverified = finalContent ? findUnverifiedClaims(finalContent, actionLog) : [];
		if (unverified.length > 0) {
			logger.warn("[AI Chat] Hallucination guard triggered:", {
				request_id: requestId,
				claims: unverified,
			});
			finalContent = `${buildHallucinationWarning(unverified)}\n\n---\n\n${finalContent}`;
		}

		return {
			role: "assistant",
			content: finalContent,
			actions: actionLog,
			usage,
			degraded,
		};
	},
};

export default ai;
