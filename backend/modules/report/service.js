import internalDeadHost from "../../internal/dead-host.js";
import internalProxyHost from "../../internal/proxy-host.js";
import internalRedirectionHost from "../../internal/redirection-host.js";
import internalStream from "../../internal/stream.js";

const reportService = {
	getHostsReport: async (access) => {
		const access_data = await access.can("reports:hosts", 1);
		const userId = access.token.getUserId(1);

		const [proxy, redirection, stream, dead] = await Promise.all([
			internalProxyHost.getCount(userId, access_data.visibility),
			internalRedirectionHost.getCount(userId, access_data.visibility),
			internalStream.getCount(userId, access_data.visibility),
			internalDeadHost.getCount(userId, access_data.visibility),
		]);

		return { proxy, redirection, stream, dead };
	},
};

export default reportService;
