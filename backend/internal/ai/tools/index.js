// Central registry for all AI tools
import * as proxyHosts from "./proxy_hosts.js";
import * as redirectionHosts from "./redirection_hosts.js";
import * as deadHosts from "./dead_hosts.js";
import * as streams from "./streams.js";
import * as users from "./users.js";
import * as certificates from "./certificates.js";
import * as accessLists from "./access_lists.js";
import * as ddnsProviders from "./ddns_providers.js";
import * as tor from "./tor.js";
import * as cloudflared from "./cloudflared.js";
import * as system from "./system.js";
import * as analytics from "./analytics.js";

const registry = {
	...proxyHosts,
	...redirectionHosts,
	...deadHosts,
	...streams,
	...users,
	...certificates,
	...accessLists,
	...ddnsProviders,
	...tor,
	...cloudflared,
	...system,
	...analytics,
};

export default registry;
