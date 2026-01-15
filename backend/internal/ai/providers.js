/**
 * AI Provider Implementations
 * Extracted from ai.js for modularity
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

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

	const genAI = new GoogleGenerativeAI(config.api_key);
	const model = genAI.getGenerativeModel({
		model: config.model || "gemini-1.5-flash",
		systemInstruction: systemPrompt,
	});

	// Convert tools to SDK format
	const geminiTools =
		tools.length > 0
			? tools.map((t) => ({
				functionDeclarations: [
					{
						name: t.function.name,
						description: t.function.description,
						parameters: t.function.parameters,
					},
				],
			}))
			: undefined;

	// Start chat session with history
	const chat = model.startChat({
		history: history.map((h) => ({
			role: h.role === "assistant" ? "model" : "user",
			parts: [{ text: h.content || "" }],
		})),
		tools: geminiTools,
	});

	console.log("[Gemini SDK] Sending message with tools:", geminiTools?.length || 0);

	const result = await chat.sendMessage(message);
	const response = result.response;

	console.log("[Gemini SDK] Response:", {
		hasText: !!response.text(),
		hasFunctionCalls: !!(response.functionCalls() && response.functionCalls().length > 0),
	});

	// Check for function calls
	const functionCalls = response.functionCalls();
	if (functionCalls && functionCalls.length > 0) {
		console.log(
			"[Gemini SDK] Tool calls detected:",
			functionCalls.map((fc) => fc.name),
		);
		return {
			content: response.text() || "",
			toolCalls: functionCalls.map((fc) => ({
				name: fc.name,
				args: fc.args,
			})),
			chat: chat, // Store chat session for follow-up
		};
	}

	return { content: response.text() || "" };
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

	// Format function responses
	const functionResponses = toolResults.map((tr) => ({
		functionResponse: {
			name: tr.name,
			response: { content: tr.result },
		},
	}));

	console.log("[Gemini SDK] Sending function responses:", functionResponses.length);

	const result = await chat.sendMessage(functionResponses);
	const response = result.response;

	// Check for more function calls
	const functionCalls = response.functionCalls();
	if (functionCalls && functionCalls.length > 0) {
		console.log(
			"[Gemini SDK] More tool calls detected:",
			functionCalls.map((fc) => fc.name),
		);
		return {
			content: response.text() || "",
			toolCalls: functionCalls.map((fc) => ({
				name: fc.name,
				args: fc.args,
			})),
			chat: chat,
		};
	}

	return { content: response.text() || "" };
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

	console.log("[Local LLM] Request:", { url, model: config.model, toolsCount: tools.length });

	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.api_key}`,
		},
		body: JSON.stringify(payload),
	});

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Local LLM Error: ${res.status} - ${err}`);
	}

	const json = await res.json();

	let content;
	let toolCalls = [];

	if (isOllamaNative) {
		content = json.message?.content || "";
		if (json.message?.tool_calls?.length > 0) {
			toolCalls = json.message.tool_calls.map((tc, idx) => ({
				id: tc.id || `call_${idx}`,
				name: tc.function?.name,
				args: tc.function?.arguments || {},
			}));
		}
	} else {
		content = json.choices?.[0]?.message?.content || "";
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
		console.log(
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
		...toolResults.map((tr, idx) => ({
			role: "tool",
			tool_call_id: previousResponse.toolCalls[idx].id, // Need to match ID
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

	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.api_key}`,
		},
		body: JSON.stringify(payload),
	});

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Local LLM Result Error: ${res.status} - ${err}`);
	}

	const json = await res.json();

	if (isOllamaNative) {
		return { content: json.message?.content || "" };
	}

	return { content: json.choices?.[0]?.message?.content || "" };
};
