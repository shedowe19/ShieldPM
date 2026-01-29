import { apiClient } from "./base";
import type { ChatIntegration } from "./models";

export const getChatIntegrations = async (): Promise<ChatIntegration[]> => {
	return apiClient.get({ url: "/chat" });
};

export const createChatIntegration = async (data: Partial<ChatIntegration>): Promise<ChatIntegration> => {
	return apiClient.post({ url: "/chat", data });
};

export const updateChatIntegration = async (id: number, data: Partial<ChatIntegration>): Promise<ChatIntegration> => {
	return apiClient.put({ url: `/chat/${id}`, data });
};

export const deleteChatIntegration = async (id: number): Promise<void> => {
	return apiClient.delete({ url: `/chat/${id}` });
};
