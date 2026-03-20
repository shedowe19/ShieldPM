import _ from "lodash";
import utils from "../../lib/utils.js";
import { nginx as logger } from "../../logger.js";
import internalAnubis from "../anubis/service.js";
import { backupConfig, deleteBackupConfig, renameConfigAsError, restoreConfig } from "./files.js";
import { generateConfig } from "./render.js";

const test = async () => utils.execFile("nginx", ["-tq"]);

const reload = async () => {
	const promises = [];
	if (process.env.ACME_OCSP_STAPLING === "true") {
		promises.push(utils.execFile("certbot-ocsp-fetcher.sh", ["-c", "/data/tls/certbot/live", "-o", "/data/tls/certbot/live", "--no-reload-webserver", "--quiet"]).catch(() => {}));
	}
	if (process.env.CUSTOM_OCSP_STAPLING === "true") {
		promises.push(utils.execFile("certbot-ocsp-fetcher.sh", ["-c", "/data/tls/custom", "-o", "/data/tls/custom", "--no-reload-webserver", "--quiet"]).catch(() => {}));
	}
	await Promise.all(promises);
	await test();
	await utils.execFile("nginx", ["-s", "reload"]);
};

const configure = async (model, hostType, host, options = {}) => {
	const skipReload = options.skip_reload || false;
	let combinedMeta = {};
	await backupConfig(hostType, host);
	try {
		await generateConfig(hostType, host);
	} catch (err) {
		logger.error(`Generation failed: ${err.message}`);
		await restoreConfig(hostType, host);
		throw err;
	}
	try {
		await test();
		combinedMeta = _.assign({}, host.meta, { nginx_online: true, nginx_err: null });
		await model.query().where("id", host.id).patch({ meta: combinedMeta });
		await deleteBackupConfig(hostType, host);
		internalAnubis.generatePolicy();
	} catch (err) {
		logger.error(`Nginx test failed: ${err.message}`);
		await renameConfigAsError(hostType, host);
		await restoreConfig(hostType, host);
		combinedMeta = _.assign({}, host.meta, { nginx_online: false, nginx_err: `[Rolled back] Configuration failed: ${err.message}` });
		await model.query().where("id", host.id).patch({ meta: combinedMeta });
	}
	if (!skipReload) await reload();
	return combinedMeta;
};

const bulkGenerateConfigs = async (model, hostType, hosts) => {
	await Promise.all(hosts.map((host) => configure(model, hostType, host, { skip_reload: true })));
};

export { bulkGenerateConfigs, configure, reload, test };
