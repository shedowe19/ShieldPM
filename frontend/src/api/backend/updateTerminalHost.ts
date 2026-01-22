import { apiClient } from "./base";

export interface UpdateTerminalHostPayload {
	name?: string;
	host?: string;
	port?: number;
	auth_type?: string;
	username?: string;
	password?: string;
	private_key?: string;
	meta?: any;
	enabled?: boolean;
}

export const updateTerminalHost = (id: number, payload: UpdateTerminalHostPayload) => {
	return apiClient.put({
		url: `nginx/terminal-hosts/${id}`,
		data: payload,
	});
};
