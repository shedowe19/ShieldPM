/**
 * AI Provider Implementations
 *
 * Both providers use the same transport rules: bounded timeout, bounded
 * retries with backoff for transient failures, cancellation through an
 * AbortSignal and structured token usage.
 */

import errs from "../../lib/error.js";
import { global as logger } from "../../logger.js";

export const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 200;
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/** Build provider endpoints without dropping reverse-proxy prefixes or duplicating /v1. */
export const getLocalEndpoint = (baseUrl, endpoint) => {
	let base;
	try {
		base = new URL(baseUrl || "http://localhost:11434");
	} catch (err) {
		throw new errs.ConfigurationError("Invalid base_url: a valid HTTP/HTTPS URL is required", err);
	}
	if (!["http:", "https:"].includes(base.protocol))
		throw new errs.ConfigurationError("Only HTTP/HTTPS protocols are allowed for base_url");
	base.pathname = `${base.pathname.replace(/\/$/, "")}/`;
	base.search = "";
	base.hash = "";
	const route = base.pathname.endsWith("/v1/") && endpoint.startsWith("v1/") ? endpoint.slice(3) : endpoint;
	return new URL(route, base);
};

const positiveInt = (value, fallback, { allowZero = false } = {}) => {
	const number = Number(value);
	if (!Number.isFinite(number)) return fallback;
	if (number === 0 && allowZero) return 0;
	if (number <= 0) return fallback;
	return Math.floor(number);
};

const timeoutMsFor = (config) => Math.min(300000, positiveInt(config?.timeout_ms, DEFAULT_TIMEOUT_MS));
const retriesFor = (config) => Math.min(5, positiveInt(config?.max_retries, DEFAULT_MAX_RETRIES, { allowZero: true }));
const retryDelayFor = (config) =>
	Math.min(10000, positiveInt(config?.retry_delay_ms, DEFAULT_RETRY_DELAY_MS, { allowZero: true }));
const maxOutputTokensFor = (config) => Math.min(32768, positiveInt(config?.max_output_tokens, 2048));

const isAbortError = (err) => err?.name === "AbortError" || err?.name === "TimeoutError" || err?.code === "ABORT_ERR";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Combines the provider timeout with the caller's cancellation signal. */
const requestSignal = (config, externalSignal) => {
	const timeout = AbortSignal.timeout(timeoutMsFor(config));
	return externalSignal ? AbortSignal.any([timeout, externalSignal]) : timeout;
};

const cancelledError = () => {
	const error = new errs.ValidationError("AI request cancelled.");
	/** @type {any} */ (error).code = "AI_REQUEST_CANCELLED";
	return error;
};

/**
 * Performs a JSON request with timeout, bounded retries and backoff.
 * @returns {Promise<Object>}
 */
const requestJson = async (url, init, config, externalSignal, label) => {
	const retries = retriesFor(config);
	const baseDelay = retryDelayFor(config);
	let attempt = 0;

	for (;;) {
		let response;
		try {
			response = await fetch(url, { ...init, signal: requestSignal(config, externalSignal) });
		} catch (err) {
			if (externalSignal?.aborted) throw cancelledError();
			if (isAbortError(err)) {
				throw new errs.InternalError(`${label}: request timed out`, { cause: "timeout" });
			}
			if (attempt >= retries) {
				throw new errs.InternalError(`${label}: request failed`, { cause: String(err?.message || err) });
			}
			await sleep(baseDelay * 2 ** attempt + Math.floor(Math.random() * 50));
			attempt++;
			continue;
		}

		if (response.ok) {
			try {
				return await response.json();
			} catch (err) {
				throw new errs.InternalError(`${label}: invalid JSON response`, { cause: String(err?.message || err) });
			}
		}

		const body = await response.text().catch(() => "");
		const transport = { status: response.status, body };
		if (!RETRYABLE_STATUS.has(response.status) || attempt >= retries) {
			throw new errs.InternalError(`${label}: ${response.status}`, transport);
		}
		logger.warn(`[AI Provider] ${label} returned ${response.status}; retrying (${attempt + 1}/${retries})`);
		await sleep(baseDelay * 2 ** attempt + Math.floor(Math.random() * 50));
		attempt++;
	}
};

const normalizeContent = (content) => {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => (typeof part === "string" ? part : typeof part?.text === "string" ? part.text : ""))
			.filter(Boolean)
			.join("");
	}
	return "";
};

const parseToolArguments = (value) => {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return { args: value, parseError: false };
	}
	if (typeof value !== "string" || value.trim() === "") return { args: {}, parseError: false };
	try {
		const parsed = JSON.parse(value);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return { args: parsed, parseError: false };
		}
		return { args: {}, parseError: true };
	} catch {
		return { args: {}, parseError: true };
	}
};

const normalizeToolCalls = (message, messages) => {
	const calls = [];
	const rawCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
	rawCalls.forEach((call, index) => {
		const name = call?.function?.name;
		if (typeof name !== "string" || name.length === 0) return;
		const { args, parseError } = parseToolArguments(call.function?.arguments);
		calls.push({
			id: call.id || `call_${messages.length}_${index}`,
			name,
			args,
			...(parseError ? { argsParseError: true } : {}),
		});
	});
	return calls;
};

const normalizeHistory = (history) =>
	(Array.isArray(history) ? history : [])
		.filter((entry) => entry && typeof entry.content === "string" && entry.content.trim().length > 0)
		.map((entry) => ({
			role: entry.role === "user" ? "user" : "assistant",
			content: entry.content,
		}));

const emptyUsage = () => ({ input_tokens: 0, output_tokens: 0, total_tokens: 0 });

const mapGeminiUsage = (metadata) => {
	if (!metadata) return emptyUsage();
	const input = Number(metadata.promptTokenCount) || 0;
	const output = Number(metadata.candidatesTokenCount) || 0;
	return {
		input_tokens: input,
		output_tokens: output,
		total_tokens: Number(metadata.totalTokenCount) || input + output,
	};
};

const mapLocalUsage = (json, isOllamaNative) => {
	const usage = json?.usage || {};
	const input = Number(usage.prompt_tokens ?? json?.prompt_eval_count) || 0;
	const output = Number(usage.completion_tokens ?? json?.eval_count) || 0;
	return {
		input_tokens: input,
		output_tokens: output,
		total_tokens: Number(usage.total_tokens) || input + output,
	};
};

/** Gemini REST content history. Consecutive same-role entries are merged. */
const appendGeminiContent = (contents, role, parts) => {
	if (!parts || parts.length === 0) return;
	const last = contents[contents.length - 1];
	if (last && last.role === role && parts.every((part) => typeof part.text === "string")) {
		last.parts.push(...parts);
		return;
	}
	contents.push({ role, parts });
};

const baseGeminiContents = (history, message) => {
	const contents = [];
	for (const entry of normalizeHistory(history)) {
		appendGeminiContent(contents, entry.role === "user" ? "user" : "model", [{ text: entry.content }]);
	}
	appendGeminiContent(contents, "user", [{ text: message }]);
	return contents;
};

const buildGeminiContents = (history, message, previousResponse, toolResults) => {
	// Gemini needs the complete functionCall/functionResponse history of earlier
	// tool rounds; rebuilding only from the browser history loses it from the
	// third provider request onward.
	const contents = Array.isArray(previousResponse?.geminiContents)
		? structuredClone(previousResponse.geminiContents)
		: baseGeminiContents(history, message);
	if (previousResponse?.toolCalls?.length) {
		contents.push({
			role: "model",
			parts: previousResponse.toolCalls.map((call) => ({
				functionCall: { name: call.name, args: call.args || {} },
			})),
		});
		contents.push({
			role: "function",
			parts: (toolResults || []).map((result) => ({
				functionResponse: {
					name: result.name,
					response: { content: result.result },
				},
			})),
		});
	}
	return contents;
};

const geminiModelName = (model) => String(model || DEFAULT_MODEL).replace(/^models\//, "");

const geminiTools = (tools) =>
	tools && tools.length > 0
		? [
				{
					functionDeclarations: tools.map((tool) => ({
						name: tool.function.name,
						description: tool.function.description,
						parameters: tool.function.parameters,
					})),
				},
			]
		: undefined;

const parseGeminiResponse = (json, config) => {
	const candidate = json?.candidates?.[0];
	if (!candidate) {
		if (json?.promptFeedback?.blockReason) {
			throw new errs.ConfigurationError(
				`The AI provider blocked the request (${json.promptFeedback.blockReason}).`,
			);
		}
		throw new errs.InternalError("Gemini returned no candidate");
	}

	const parts = Array.isArray(candidate.content?.parts) ? candidate.content.parts : [];
	const content = parts
		.filter((part) => typeof part.text === "string")
		.map((part) => part.text)
		.join("");
	const toolCalls = parts
		.filter((part) => part?.functionCall?.name)
		.map((part, index) => ({
			id: `gemini_call_${index}`,
			name: part.functionCall.name,
			args: part.functionCall.args || {},
		}));

	return {
		content,
		toolCalls,
		rawParts: parts,
		usage: mapGeminiUsage(json.usageMetadata),
		provider: "gemini",
		model: geminiModelName(config?.model),
	};
};

const geminiRequest = async (config, systemPrompt, contents, tools, externalSignal, label) => {
	if (!config?.api_key) throw new errs.ConfigurationError("Gemini API Key is missing");
	const model = geminiModelName(config.model);
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
	const body = {
		systemInstruction: { parts: [{ text: systemPrompt }] },
		contents,
		generationConfig: {
			temperature: 0,
			maxOutputTokens: maxOutputTokensFor(config),
		},
	};
	const declarations = geminiTools(tools);
	if (declarations) body.tools = declarations;

	logger.debug(`[Gemini] ${label}:`, { model, tools: tools?.length || 0 });
	const json = await requestJson(
		url,
		{
			method: "POST",
			headers: { "Content-Type": "application/json", "x-goog-api-key": config.api_key },
			body: JSON.stringify(body),
		},
		config,
		externalSignal,
		label,
	);
	return parseGeminiResponse(json, config);
};

/**
 * Call Gemini API.
 * @param {Object} config AI configuration
 * @param {string} systemPrompt System prompt
 * @param {string} message User message
 * @param {Array} history Chat history
 * @param {Array} tools Tool definitions
 * @param {{signal?: AbortSignal}} [options]
 */
export const callGemini = async (config, systemPrompt, message, history, tools, options = {}) => {
	const contents = buildGeminiContents(history, message, null, null);
	const response = await geminiRequest(config, systemPrompt, contents, tools, options.signal, "Gemini Error");
	return { ...response, geminiContents: contents };
};

/**
 * Call Gemini with tool results.
 * @param {Object} config AI configuration
 * @param {string} systemPrompt System prompt
 * @param {string} message User message
 * @param {Array} history Chat history
 * @param {Object} previousResponse Previous response with toolCalls
 * @param {Array} toolResults Results from tool execution
 * @param {Array} tools Tool definitions
 * @param {{signal?: AbortSignal}} [options]
 */
export const callGeminiWithResults = async (
	config,
	systemPrompt,
	message,
	history,
	previousResponse,
	toolResults,
	tools,
	options = {},
) => {
	const contents = buildGeminiContents(history, message, previousResponse, toolResults);
	const response = await geminiRequest(config, systemPrompt, contents, tools, options.signal, "Gemini Result Error");
	return { ...response, geminiContents: contents };
};

const localDialect = (config) => {
	const baseUrl = config?.base_url || "http://localhost:11434";
	if (config?.dialect === "ollama") return "ollama";
	if (config?.dialect === "openai") return "openai";
	// Legacy heuristic kept for configurations created before `dialect` existed.
	return baseUrl.includes(":11434") && !baseUrl.includes("/v1") ? "ollama" : "openai";
};

const localEndpoint = (config, dialect) => {
	const baseUrl = config.base_url || "http://localhost:11434";
	try {
		return getLocalEndpoint(baseUrl, dialect === "ollama" ? "api/chat" : "v1/chat/completions").toString();
	} catch (err) {
		throw new errs.ConfigurationError("Invalid base_url", err);
	}
};

const localHeaders = (config) => {
	const headers = { "Content-Type": "application/json" };
	if (config?.api_key) headers.Authorization = `Bearer ${config.api_key}`;
	return headers;
};

const localPayload = (config, messages, dialect, tools) => {
	const maxTokens = maxOutputTokensFor(config);
	const body = {
		model: config.model,
		messages,
		stream: false,
		temperature: 0,
	};
	if (dialect === "ollama") {
		body.options = {
			num_ctx: config.num_ctx || 8192,
			num_batch: config.num_batch || 512,
			num_thread: config.num_thread || 4,
			num_predict: maxTokens,
			temperature: 0,
		};
		body.keep_alive = config.keep_alive || "5m";
	} else {
		body.max_tokens = maxTokens;
	}
	if (tools && tools.length > 0) {
		body.tools = tools.map((tool) => ({ type: "function", function: tool.function }));
	}
	return body;
};

const parseLocalResponse = (json, dialect, messages) => {
	const message = dialect === "ollama" ? json?.message : json?.choices?.[0]?.message;
	return {
		content: normalizeContent(message?.content),
		toolCalls: normalizeToolCalls(message, messages),
		messages,
		usage: mapLocalUsage(json, dialect === "ollama"),
		provider: "local",
		model: json?.model,
	};
};

const sendLocalRequest = async (config, payload, externalSignal, label) => {
	const dialect = localDialect(config);
	const url = localEndpoint(config, dialect);
	logger.debug(`[Local LLM] ${label}:`, { url, model: config.model, tools: payload.tools?.length || 0 });
	const json = await requestJson(
		url,
		{ method: "POST", headers: localHeaders(config), body: JSON.stringify(payload) },
		config,
		externalSignal,
		label,
	);
	return parseLocalResponse(json, dialect, payload.messages);
};

/**
 * Call Local LLM (Ollama/OpenAI compatible).
 * @param {Object} config AI configuration
 * @param {string} systemPrompt System prompt
 * @param {string} message User message
 * @param {Array} history Chat history
 * @param {Array} tools Tool definitions
 * @param {{signal?: AbortSignal}} [options]
 */
export const callLocalLLM = async (config, systemPrompt, message, history, tools, options = {}) => {
	const dialect = localDialect(config);
	const messages = [
		{ role: "system", content: systemPrompt },
		...normalizeHistory(history),
		{ role: "user", content: message },
	];
	const payload = localPayload(config, messages, dialect, tools);
	return sendLocalRequest(config, payload, options.signal, "Local LLM Error");
};

/**
 * Call Local LLM with tool results.
 * @param {Object} config AI configuration
 * @param {string} systemPrompt System prompt
 * @param {string} message User message
 * @param {Array} history Chat history
 * @param {Object} previousResponse Previous response with toolCalls
 * @param {Array} toolResults Results from tool execution
 * @param {Array} tools Tool definitions
 * @param {{signal?: AbortSignal}} [options]
 */
export const callLocalWithResults = async (
	config,
	systemPrompt,
	message,
	history,
	previousResponse,
	toolResults,
	tools = [],
	options = {},
) => {
	const dialect = localDialect(config);
	const messages = [
		...(Array.isArray(previousResponse?.messages) && previousResponse.messages.length > 0
			? previousResponse.messages
			: [
					{ role: "system", content: systemPrompt },
					...normalizeHistory(history),
					{ role: "user", content: message },
				]),
		{
			role: "assistant",
			content: normalizeContent(previousResponse?.content),
			tool_calls: (previousResponse?.toolCalls || []).map((call) => ({
				id: call.id,
				type: "function",
				function: {
					name: call.name,
					arguments: dialect === "ollama" ? call.args : JSON.stringify(call.args),
				},
			})),
		},
		...(toolResults || []).map((result) => ({
			role: "tool",
			tool_call_id: result.toolCallId,
			...(dialect === "ollama" ? { tool_name: result.name } : {}),
			content: typeof result.result === "string" ? result.result : JSON.stringify(result.result),
		})),
	];
	const payload = localPayload(config, messages, dialect, tools);
	return sendLocalRequest(config, payload, options.signal, "Local LLM Result Error");
};
