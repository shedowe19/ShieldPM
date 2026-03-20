import { updateConfig } from "./config.js";
import { WEBSITES_DIR, getAuth, getWebsiteDir, intervalToMs, pollingTimers } from "./helpers.js";
import { init, startPolling, startPollingForHost, stopAllPolling, stopPolling } from "./polling.js";
import { getStatus, sync } from "./sync.js";

export default {
	sync,
	getStatus,
	updateConfig,
	startPolling,
	startPollingForHost,
	stopPolling,
	stopAllPolling,
	init,
	getWebsiteDir,
	getAuth,
	intervalToMs,
	WEBSITES_DIR,
	pollingTimers,
};
