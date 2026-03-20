import internalDeadHost from "../dead-host/service.js";
import internalProxyHost from "../proxy-host/service.js";
import internalRedirectionHost from "../redirection-host/service.js";
import internalStream from "../stream/service.js";

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
