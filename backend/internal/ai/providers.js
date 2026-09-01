/**
 * AI Provider Implementations
 * Extracted from ai.js for modularity
 */

import { global as logger } from "../../logger.js";

const GOOGLE_GENAI_PACKAGE = "@google/genai";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const PROVIDER_TIMEOUT_MS = 30_000;
const MAX_PROVIDER_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_PROVIDER_CONTENT_BYTES = 64 * 1024;
let googleSdkPromise;

const loadGoogleSdk = async () => {
	googleSdkPromise ||= import(GOOGLE_GENAI_PACKAGE);
	return googleSdkPromise;
};

const boundedContent = (value) => {
	if (typeof value !== "string") return "";
	const buffer = Buffer.from(value, "utf8");
	return buffer.length <= MAX_PROVIDER_CONTENT_BYTES
		? buffer.toString("utf8")
		: `${buffer.subarray(0, MAX_PROVIDER_CONTENT_BYTES).toString("utf8")}\n[TRUNCATED]`;
};

const readBoundedBody = async (response) => {
	const declaredLength = Number.parseInt(response.headers.get("content-length") || "0", 10);
	if (declaredLength > MAX_PROVIDER_RESPONSE_BYTES) throw new RangeError("AI provider response is too large");
	const chunks = [];
	let total = 0;
	for await (const chunk of response.body || []) {
		const buffer = Buffer.from(chunk);
		total += buffer.length;
		if (total > MAX_PROVIDER_RESPONSE_BYTES) throw new RangeError("AI provider response is too large");
		chunks.push(buffer);
	}
	return Buffer.concat(chunks).toString("utf8");
};

const readProviderJson = async (response) => {
	const body = await readBoundedBody(response);
	try {
		return JSON.parse(body);
	} catch (_err) {
		throw new TypeError("AI provider returned invalid JSON");
	}
};

const normalizeGeminiResponse = (response, chat) => {
	const functionCalls = Array.isArray(response.functionCalls) ? response.functionCalls : [];
	if (functionCalls.length > 0) {
		logger.info(
			"[Gemini SDK] Native tool calls detected:",
			functionCalls.map((call) => call.name),
		);
		return {
			content: boundedContent(response.text),
			toolCalls: functionCalls.map((call) => ({ id: call.id, name: call.name, args: call.args || {} })),
			chat,
		};
	}
	return { content: boundedContent(response.text), chat };
};

/**
 * Call Gemini API
 * @param {Object} config - AI configuration
 * @param {string} systemPrompt - System prompt
 * @param {string} message - User message
 * @param {Array} history - Chat history
 * @param {Array} tools - Tool definitions
 * @returns {Promise<Object>} Response with content and optional toolCalls
 */
export const callGemini = async (config, systemPrompt, message, history, tools) => {
	if (!config.api_key) throw new Error("Gemini API Key is missing");
	const { GoogleGenAI } = await loadGoogleSdk();
	const client = new GoogleGenAI({ apiKey: config.api_key, httpOptions: { timeout: PROVIDER_TIMEOUT_MS } });
	const functionDeclarations = tools.map((tool) => ({
		name: tool.function.name,
		description: tool.function.description,
		// The hardened definitions are JSON Schema, not the narrower Gemini
		// Schema type. @google/genai 2.x exposes this stable field specifically
		// for standard JSON Schema (including additionalProperties: false).
		parametersJsonSchema: tool.function.parameters,
	}));
	const chat = client.chats.create({
		model: config.model || DEFAULT_GEMINI_MODEL,
		history: history.map((h) => ({
			role: h.role === "assistant" ? "model" : "user",
			parts: [{ text: h.content || "" }],
		})),
		config: {
			systemInstruction: systemPrompt,
			tools: functionDeclarations.length ? [{ functionDeclarations }] : undefined,
			maxOutputTokens: 4096,
		},
	});
	logger.debug("[Gemini SDK] Sending message with native tools:", functionDeclarations.length);
	return normalizeGeminiResponse(await chat.sendMessage({ message }), chat);
};

/**
 * Call Gemini with tool results
 * @param {Object} _config - AI configuration
 * @param {string} _systemPrompt - System prompt
 * @param {string} _message - User message
 * @param {Array} _history - Chat history
 * @param {Object} previousResponse - Previous response with chat session
 * @param {Array} toolResults - Results from tool execution
 * @param {Array} _tools - Tool definitions
 * @returns {Promise<Object>} Response with content and optional toolCalls
 */
export const callGeminiWithResults = async (
	_config,
	_systemPrompt,
	_message,
	_history,
	previousResponse,
	toolResults,
	_tools,
) => {
	const chat = previousResponse.chat;

	const functionResponses = toolResults.map((tr) => ({
		functionResponse: {
			name: tr.name,
			id: tr.toolCallId,
			response: { result: tr.result },
		},
	}));
	logger.debug("[Gemini SDK] Sending function responses:", functionResponses.length);
	return normalizeGeminiResponse(await chat.sendMessage({ message: functionResponses }), chat);
};

/**
 * Call Local LLM (Ollama/OpenAI Compatible)
 * @param {Object} config - AI configuration
 * @param {string} systemPrompt - System prompt
 * @param {string} message - User message
 * @param {Array} history - Chat history
 * @param {Array} tools - Tool definitions
 * @returns {Promise<Object>} Response with content and optional toolCalls
 */
export const callLocalLLM = async (config, systemPrompt, message, history, tools) => {
	const baseUrl = config.base_url || "http://localhost:11434";
	const isOllamaNative = baseUrl.includes(":11434") && !baseUrl.includes("/v1");

	let targetUrl;
	try {
		if (isOllamaNative) {
			targetUrl = new URL("api/chat", baseUrl);
		} else {
			targetUrl = new URL("v1/chat/completions", baseUrl);
		}
	} catch (err) {
		throw new Error(`Invalid base_url: ${err.message}`);
	}
	const url = targetUrl.toString();

	const messages = [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: message }];

	let payload;
	const options = {
		num_ctx: config.num_ctx || 8192,
		num_batch: config.num_batch || 512,
		num_thread: config.num_thread || 4,
	};

	const ollamaTools =
		tools.length > 0
			? tools.map((t) => ({
					type: "function",
					function: {
						name: t.function.name,
						description: t.function.description,
						parameters: t.function.parameters,
					},
				}))
			: undefined;

	if (isOllamaNative) {
		payload = {
			model: config.model,
			messages,
			stream: false,
			keep_alive: config.keep_alive || "5m",
			options,
			tools: ollamaTools,
		};
	} else {
		payload = {
			model: config.model,
			messages,
			keep_alive: config.keep_alive || "5m",
			options,
			tools: ollamaTools,
		};
	}

	logger.debug("[Local LLM] Request:", { url, model: config.model, toolsCount: tools.length });

	/** @type {Record<string, string>} */
	const headers = { "Content-Type": "application/json" };
	if (config.api_key) headers.Authorization = `Bearer ${config.api_key}`;
	const res = await fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
	});

	if (!res.ok) {
		await readBoundedBody(res).catch(() => "");
		throw new Error(`Local LLM Error: ${res.status}`);
	}

	const json = await readProviderJson(res);

	let content;
	let toolCalls = [];

	if (isOllamaNative) {
		content = boundedContent(json.message?.content);
		if (json.message?.tool_calls?.length > 0) {
			toolCalls = json.message.tool_calls.map((tc, idx) => ({
				id: tc.id || `call_${idx}`,
				name: tc.function?.name,
				args: tc.function?.arguments || {},
			}));
		}
	} else {
		content = boundedContent(json.choices?.[0]?.message?.content);
		if (json.choices?.[0]?.message?.tool_calls?.length > 0) {
			toolCalls = json.choices[0].message.tool_calls.map((tc) => ({
				id: tc.id,
				name: tc.function?.name,
				args:
					typeof tc.function?.arguments === "string"
						? JSON.parse(tc.function.arguments)
						: tc.function?.arguments,
			}));
		}
	}

	if (toolCalls.length > 0) {
		logger.info(
			"[Local LLM] Tool calls detected:",
			toolCalls.map((tc) => tc.name),
		);
		return {
			content,
			toolCalls,
		};
	}

	return { content };
};

/**
 * Call Local LLM with tool results
 * @param {Object} config - AI configuration
 * @param {string} systemPrompt - System prompt
 * @param {string} message - User message
 * @param {Array} history - Chat history
 * @param {Object} previousResponse - Previous response with toolCalls
 * @param {Array} toolResults - Results from tool execution
 * @returns {Promise<Object>} Response with content
 */
export const callLocalWithResults = async (config, systemPrompt, message, history, previousResponse, toolResults) => {
	const baseUrl = config.base_url || "http://localhost:11434";
	const isOllamaNative = baseUrl.includes(":11434") && !baseUrl.includes("/v1");

	let targetUrl;
	try {
		if (isOllamaNative) {
			targetUrl = new URL("api/chat", baseUrl);
		} else {
			targetUrl = new URL("v1/chat/completions", baseUrl);
		}
	} catch (err) {
		throw new Error(`Invalid base_url: ${err.message}`);
	}
	const url = targetUrl.toString();

	const messages = [
		{ role: "system", content: systemPrompt },
		...history,
		{ role: "user", content: message },
		// Initial Assistant Response with Tool Calls
		{
			role: "assistant",
			content: previousResponse.content,
			tool_calls: previousResponse.toolCalls.map((tc) => {
				// Ollama Native expects arguments as JSON object, not string
				if (isOllamaNative) {
					return {
						id: tc.id,
						type: "function",
						function: {
							name: tc.name,
							arguments: tc.args, // Already an object
						},
					};
				}
				// OpenAI Compatible expects JSON string
				return {
					id: tc.id,
					type: "function",
					function: {
						name: tc.name,
						arguments: JSON.stringify(tc.args),
					},
				};
			}),
		},
		// Tool Outputs
		...toolResults.map((tr) => ({
			role: "tool",
			tool_call_id: tr.toolCallId,
			content: tr.result,
		})),
	];

	let payload;
	const options = {
		num_ctx: config.num_ctx || 8192,
		num_batch: config.num_batch || 512,
		num_thread: config.num_thread || 4,
	};

	if (isOllamaNative) {
		payload = {
			model: config.model,
			messages,
			stream: false,
			keep_alive: config.keep_alive || "5m",
			options,
		};
	} else {
		payload = {
			model: config.model,
			messages,
			keep_alive: config.keep_alive || "5m",
			options,
		};
	}

	/** @type {Record<string, string>} */
	const headers = { "Content-Type": "application/json" };
	if (config.api_key) headers.Authorization = `Bearer ${config.api_key}`;
	const res = await fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
	});

	if (!res.ok) {
		await readBoundedBody(res).catch(() => "");
		throw new Error(`Local LLM Result Error: ${res.status}`);
	}

	const json = await readProviderJson(res);

	if (isOllamaNative) {
		return { content: boundedContent(json.message?.content) };
	}

	return { content: boundedContent(json.choices?.[0]?.message?.content) };
};
