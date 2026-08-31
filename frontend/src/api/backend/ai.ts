import { get, post, put } from "./base";
import type { AiChatMessage, AiChatResponse, AiConfig } from "./models.ts";

export function getAiConfig(): Promise<AiConfig> {
	return get({ url: "/ai/config" });
}

export function updateAiConfig(data: AiConfig): Promise<AiConfig> {
	return put({ url: "/ai/config", data: data as unknown as Record<string, unknown> });
}

export function sendAiChat(message: string, history: AiChatMessage[]): Promise<AiChatResponse> {
	return post({ url: "/ai/chat", data: { message, history } });
}

export function confirmAiAction(confirmationToken: string): Promise<AiChatResponse> {
	return post({ url: "/ai/confirm", data: { confirmation_token: confirmationToken } });
}

export function getAiModels(config: Partial<AiConfig>): Promise<{ id: string; name: string }[]> {
	return post({ url: "/ai/models", data: config as unknown as Record<string, unknown> });
}
