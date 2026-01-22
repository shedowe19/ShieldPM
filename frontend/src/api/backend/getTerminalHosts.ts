import { apiClient } from "./base";
import type { TerminalHost } from "./models";

export interface GetTerminalHostsResponse {
	[key: number]: TerminalHost;
}

export const getTerminalHosts = (expand?: string[], userId?: number) => {
	const params: any = {};
	if (expand) {
		params.expand = expand.join(",");
	}
	if (userId) {
		params.owner_user_id = userId;
	}

	return apiClient.get({
		url: "nginx/terminal-hosts",
		params,
	});
};
