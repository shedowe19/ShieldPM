import { exec } from "node:child_process";
import fs from "node:fs";
import yaml from "js-yaml";
import _ from "lodash";
import { internal as logger } from "../../logger.js";
import ProxyHost from "../../models/proxy_host.js";
import { buildPolicy } from "./policy.js";

const POLICY_FILE = "/data/anubis/policy.yaml";

const anubisService = {
	generatePolicy: _.debounce(async () => {
		try {
			logger.info("Generating Anubis Policy...");

			const hosts = await ProxyHost.query().where("is_deleted", 0).where("enabled", 1).where("anubis_enabled", 1);
			const policy = buildPolicy(hosts);

			const yamlStr = yaml.dump(policy);
			fs.writeFileSync(POLICY_FILE, yamlStr);
			logger.info(`Anubis Policy written to ${POLICY_FILE}`);

			anubisService.reload();
		} catch (err) {
			logger.error("Failed to generate Anubis policy:", err);
		}
	}, 2000),

	reload: () => {
		exec("pkill -HUP anubis", (err) => {
			if (!err) logger.info("Anubis configuration reloaded");
		});
	},
};

export default anubisService;
