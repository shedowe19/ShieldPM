import { global as logger } from "../../logger.js";
import * as aiProviders from "../../internal/ai/providers.js";
import { executeTools } from "../../internal/ai/executor.js";
import { getSystemPrompt } from "../../internal/ai/prompt.js";
import { getToolDefinitions } from "../../internal/ai/tools.js";
import { getConfigForChat } from "./config.js";

const extractToolsFromText = (resp) => {
	if ((!resp.toolCalls || resp.toolCalls.length === 0) && resp.content) {
		const toolCallPatterns = [
			/\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[^}]+\})\s*\}/g,
			/(\w+_\w+)\s*\(\s*(\{[^}]*\}|\s*)\s*\)/g,
			/(\w+_\w+)\s*(\{[^}]+\})/g,
			/<tool_?call(?:\s+[^>]*)?>([\s\S]*?)<\/tool_?call>/gi,
		];
		for (const pattern of toolCallPatterns) {
			const matches = [...resp.content.matchAll(pattern)];
			if (matches.length > 0) {
				logger.warn("[AI Chat] FALLBACK: Detected tool call in text response, extracting...");
				resp.toolCalls = resp.toolCalls || [];
				for (const match of matches) {
					try {
						let toolName;
						let args;
						if (match[0].startsWith("<tool")) {
							const json = JSON.parse(match[1]);
							toolName = json.name;
							args = json.arguments || {};
						} else if (match[1] && match[2]) {
							toolName = match[1];
							args = JSON.parse((match[2] || "{}").replace(/'/g, '"'));
						} else {
							toolName = match[1];
							args = JSON.parse((match[2] || "{}").replace(/'/g, '"'));
						}
						const definedTools = getToolDefinitions();
						const exactMatch = definedTools.find((t) => t.function.name === toolName);
						if (!exactMatch) {
							const looseMatch = definedTools.find((t) => t.function.name.replace(/_/g, "") === toolName.replace(/_/g, ""));
							if (looseMatch) {
								logger.info(`[AI Chat] Normalizing tool name: ${toolName} -> ${looseMatch.function.name}`);
								toolName = looseMatch.function.name;
							}
						}
						resp.toolCalls.push({ name: toolName, args });
						logger.info(`[AI Chat] FALLBACK: Extracted tool call: ${toolName}`, args);
					} catch (e) {
						logger.warn("[AI Chat] FALLBACK: Failed to parse embedded tool call:", e.message);
					}
				}
				if (resp.toolCalls.length > 0) resp.content = "";
				break;
			}
		}
	}
};

const chat = async (access, message, history = []) => {
	const config = await getConfigForChat();
	if (!config.enabled) throw new Error("AI Agent is disabled.");
	logger.debug("[DEBUG] AI Chat Config:", { provider: config.provider, model: config.model, baseUrl: config.base_url });
	if (config.provider === "local" && config.model && config.model.includes("gemini")) {
		logger.warn(`[AI] Sanitzing model for Local provider. Invalid model: ${config.model}`);
		config.model = "";
	}
	access.is_ai = true;
	const systemPrompt = getSystemPrompt(config);
	const tools = getToolDefinitions();
	logger.info("[AI Chat] Calling LLM:", { provider: config.provider, messageLength: message.length, toolsCount: tools.length });
	let response = config.provider === "gemini"
		? await aiProviders.callGemini(config, systemPrompt, message, history, tools)
		: await aiProviders.callLocalLLM(config, systemPrompt, message, history, tools);
	logger.info("[AI Chat] LLM Response:", { hasContent: !!response.content, hasToolCalls: !!response.toolCalls, contentLength: response.content?.length || 0 });
	let iterations = 0;
	const MAX_ITERATIONS = 5;
	let wasToolExecuted = false;
	const actionWords = [/gelöscht/i,/erstellt/i,/aktiviert/i,/deaktiviert/i,/aktualisiert/i,/deleted/i,/created/i,/enabled/i,/disabled/i,/updated/i,/removed/i,/added/i];
	const runExtract = () => extractToolsFromText(response);
	const callWithResults = async (toolResults) => config.provider === "gemini"
		? aiProviders.callGeminiWithResults(config, systemPrompt, message, history, response, toolResults, tools)
		: aiProviders.callLocalWithResults(config, systemPrompt, message, history, response, toolResults);
		runExtract();
	while (response.toolCalls && response.toolCalls.length > 0 && iterations < MAX_ITERATIONS) {
		iterations++;
		wasToolExecuted = true;
		logger.info(`[AI Chat] Executing tools (Turn ${iterations}):`, response.toolCalls.map((tc) => tc.name));
		const toolResults = await executeTools(access, response.toolCalls);
		logger.info(`[AI Chat] Tool results (Turn ${iterations}):`, toolResults.map((tr) => ({ name: tr.name, resultLength: tr.result?.length || 0 })));
		response = await callWithResults(toolResults);
		runExtract();
		logger.info(`[AI Chat] LLM Response (Turn ${iterations}):`, { hasContent: !!response.content, hasToolCalls: !!response.toolCalls, contentLength: response.content?.length || 0 });
	}
	logger.debug("[AI Chat] Returning response:", { role: "assistant", contentLength: response.content?.length || 0 });
	let finalContent = response.content || "";
	if (finalContent) {
		finalContent = finalContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
		finalContent = finalContent.replace(/<tool_?call>[\s\S]*?<\/tool_?call>/gi, "").trim();
	}
	if (!finalContent && wasToolExecuted) finalContent = "✅ Validated actions. Please check the system state updates.";
	const toolsExecuted = wasToolExecuted || (response.toolCalls && response.toolCalls.length > 0);
	if (!toolsExecuted && finalContent) {
		const claimsAction = actionWords.some((pattern) => pattern.test(finalContent));
		if (claimsAction) {
			logger.warn("[AI Chat] WARNING: AI claims action but no tool was executed!");
			finalContent = `⚠️ WARNING: The AI claims to have performed an action, but no tool was executed. Please verify manually!\n\n---\n\n${finalContent}`;
		}
	}
	return { role: "assistant", content: finalContent };
};

export { chat };
