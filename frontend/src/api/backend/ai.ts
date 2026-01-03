import { get, put, post } from "./base";
import { AiConfig, AiChatResponse, AiChatMessage } from "./models.ts";

export function getAiConfig(): Promise<AiConfig> {
    return get({ url: "/ai/config" });
}

export function updateAiConfig(data: AiConfig): Promise<AiConfig> {
    return put({ url: "/ai/config", data });
}

export function sendAiChat(message: string, history: AiChatMessage[]): Promise<AiChatResponse> {
    return post({ url: "/ai/chat", data: { message, history } });
}

export function getAiModels(config: Partial<AiConfig>): Promise<{ id: string; name: string }[]> {
    return post({ url: "/ai/models", data: config });
}
