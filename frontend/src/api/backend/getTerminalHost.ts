import { apiClient } from "./base";

export const getTerminalHost = (id: number, expand?: string[]) => {
	const params: any = {};
	if (expand) {
		params.expand = expand.join(",");
	}

	return apiClient.get({
		url: `nginx/terminal-hosts/${id}`,
		params,
	});
};
