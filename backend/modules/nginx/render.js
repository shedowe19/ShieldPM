import fs from "node:fs";
import { dirname } from "node:path";
import dayjs from "dayjs";
import _ from "lodash";
import punycode from "punycode.js";
import errs from "../../lib/error.js";
import utils from "../../lib/utils.js";
import { debug, nginx as logger } from "../../logger.js";
import { __dirname, advancedConfigHasDefaultLocation, getConfigName, getFileFriendlyHostType } from "./helpers.js";

const renderLocations = async (host) => {
	const renderEngine = utils.getRenderEngine();
	const templatePath = `${__dirname}/../../templates/_proxy_host_custom_location.conf`;
	const renderedLocationsArray = await Promise.all(
		host.locations.map(async (location) => {
			const locationCopy = Object.assign(
				{},
				{ access_list_id: host.access_list_id },
				{ certificate_id: host.certificate_id },
				{ ssl_forced: host.ssl_forced },
				{ caching_enabled: host.caching_enabled },
				{ block_exploits: host.block_exploits },
				{ allow_websocket_upgrade: host.allow_websocket_upgrade },
				{ http2_support: host.http2_support },
				{ hsts_enabled: host.hsts_enabled },
				{ hsts_subdomains: host.hsts_subdomains },
				{ access_list: host.access_list },
				{ certificate: host.certificate },
				location,
			);
			if (
				locationCopy.forward_host.indexOf("/") > -1 &&
				!locationCopy.forward_host.startsWith("/") &&
				!locationCopy.forward_host.startsWith("unix")
			) {
				const split = locationCopy.forward_host.split("/");
				locationCopy.forward_host = split.shift();
				locationCopy.forward_path = `/${split.join("/")}`;
			}
			locationCopy.env = process.env;
			return renderEngine.renderFile(templatePath, locationCopy);
		}),
	);
	return renderedLocationsArray.join("");
};

const generateConfig = async (hostType, hostRow) => {
	const host = JSON.parse(JSON.stringify(hostRow));
	const niceHostType = getFileFriendlyHostType(hostType);
	const renderEngine = utils.getRenderEngine();
	const filename = getConfigName(niceHostType, host.id);
	const templatePath = `${__dirname}/../../templates/${niceHostType}.conf`;
	let origLocations;
	if (niceHostType !== "default") {
		host.use_default_location = true;
		if (typeof host.advanced_config !== "undefined" && host.advanced_config) {
			host.use_default_location = !advancedConfigHasDefaultLocation(host.advanced_config);
		}
	}
	if (niceHostType === "redirection_host" && ["http", "https"].indexOf(host.forward_scheme.toLowerCase()) === -1) {
		host.forward_scheme = "$scheme";
	}
	if (host.locations) {
		origLocations = [].concat(host.locations);
		const renderedLocations = await renderLocations(host);
		host.locations = renderedLocations;
		_.map(host.locations, (location) => {
			if (location.path === "/") host.use_default_location = false;
			return true;
		});
	}
	if (
		host.forward_host &&
		host.forward_host.indexOf("/") > -1 &&
		!host.forward_host.startsWith("/") &&
		!host.forward_host.startsWith("unix")
	) {
		const split = host.forward_host.split("/");
		host.forward_host = split.shift();
		host.forward_path = `/${split.join("/")}`;
	}
	if (host.domain_names) {
		host.server_names = host.domain_names.map((domainName) => punycode.toASCII(domainName));
	}
	host.env = process.env;
	if (host.certificate && host.certificate.provider === "internal") host.use_ml_kem = true;
	const now = dayjs();
	host.maintenance_mode = false;
	if (host.maintenance_active) host.maintenance_mode = true;
	else if (host.maintenance_start && host.maintenance_end) {
		const start = dayjs(host.maintenance_start);
		const end = dayjs(host.maintenance_end);
		if (now.isAfter(start) && now.isBefore(end)) host.maintenance_mode = true;
	}
	if (host.index_file?.includes("/")) {
		const indexDir = dirname(host.index_file);
		if (indexDir && indexDir !== ".") host.index_dir = indexDir;
	}
	try {
		const configText = await renderEngine.renderFile(templatePath, host);
		await fs.promises.writeFile(filename, configText, { encoding: "utf8" });
		debug(logger, "Wrote config:", filename);
		host.locations = origLocations;
	} catch (err) {
		debug(logger, `Could not write ${filename}:`, err.message);
		throw new errs.ConfigurationError(err.message);
	}
	if (process.env.DISABLE_NGINX_BEAUTIFIER === "false") {
		try {
			await utils.execFile("nginxbeautifier", ["-s", "4", filename]);
		} catch {}
	}
	return true;
};

export { generateConfig, renderLocations };
