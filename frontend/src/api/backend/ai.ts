import { get, post, put } from "./base";
import type { AiChatMessage, AiChatResponse, AiConfig, AiPendingTool } from "./models.ts";

export function getAiConfig(): Promise<AiConfig> {
	return get({ url: "/ai/config" });
}

export function updateAiConfig(data: AiConfig): Promise<AiConfig> {
	return put({ url: "/ai/config", data: data as unknown as Record<string, unknown> });
}

export interface AiChatOptions {
	confirm?: boolean;
	pendingTools?: AiPendingTool[];
}

export function sendAiChat(
	message: string,
	history: AiChatMessage[],
	options?: AiChatOptions,
): Promise<AiChatResponse> {
	const data: Record<string, unknown> = { message, history };
	// Only send confirmation fields when the user actually approved a plan.
	if (options?.confirm === true) {
		data.confirm = true;
		data.pendingTools = options.pendingTools ?? [];
	}
	return post({ url: "/ai/chat", data });
}

export function getAiModels(config: Partial<AiConfig>): Promise<{ id: string; name: string }[]> {
	return post({ url: "/ai/models", data: config as unknown as Record<string, unknown> });
}
