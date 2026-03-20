import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const getFileFriendlyHostType = (hostType) => hostType.replace(/-/g, "_");

const getConfigName = (hostType, hostId) => {
	if (hostType === "default") {
		return "/usr/local/nginx/conf/conf.d/default.conf";
	}
	return `/data/nginx/${getFileFriendlyHostType(hostType)}/${hostId}.conf`;
};

const advancedConfigHasDefaultLocation = (cfg) => !!cfg.match(/^(?:.*;)?\s*?location\s*?\/\s*?{/im);

export { __dirname, advancedConfigHasDefaultLocation, getConfigName, getFileFriendlyHostType };
