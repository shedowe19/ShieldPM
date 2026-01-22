import { apiClient } from "./base";

export const deleteTerminalHost = (id: number) => {
	return apiClient.delete({
		url: `nginx/terminal-hosts/${id}`,
	});
};
