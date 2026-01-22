import { apiClient } from "./base";

export interface CreateTerminalHostPayload {
	name: string;
	host: string;
	port: number;
	auth_type: string;
	username: string;
	password?: string;
	private_key?: string;
	meta?: any;
}

export const createTerminalHost = (payload: CreateTerminalHostPayload) => {
	return apiClient.post({
		url: "nginx/terminal-hosts",
		data: payload,
	});
};
