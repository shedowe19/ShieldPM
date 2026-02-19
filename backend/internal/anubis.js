import { exec } from "node:child_process";
import fs from "node:fs";
import yaml from "js-yaml";
import { internal as logger } from "../logger.js";
import ProxyHost from "../models/proxy_host.js";

const POLICY_FILE = "/data/anubis/policy.yaml";

const internalAnubis = {
	/**
	 * Generates the Anubis policy.yaml from database
	 *
	 * Uses the correct Anubis `bots:` section syntax.
	 * See: https://anubis.techaro.lol/docs/admin/policies
	 *
	 * Each bot rule supports:
	 *   - name: unique kebab-case identifier
	 *   - user_agent_regex: regex to match User-Agent header
	 *   - path_regex: regex to match request path
	 *   - headers_regex: object of header_name -> regex pairs
	 *   - action: ALLOW | DENY | CHALLENGE
	 *   - challenge: { difficulty, algorithm } (optional)
	 *
	 * @returns {Promise<void>}
	 */
	generatePolicy: async () => {
		try {
			logger.info("Generating Anubis Policy...");

			// Fetch all enabled proxy hosts with Anubis enabled
			const hosts = await ProxyHost.query().where("is_deleted", 0).where("enabled", 1).where("anubis_enabled", 1);

			const policy = {
				bots: [],
			};

			// Generate bot rules from per-host UI rules
			let ruleIndex = 0;
			for (const host of hosts) {
				const rules = host["anubis_rules"];

				if (rules && Array.isArray(rules)) {
					for (const rule of rules) {
						if (!rule.path || !rule.action) continue;

						const domains = host.domain_names;
						if (!domains || domains.length === 0) continue;

						ruleIndex++;
						const botRule = {
							name: `shieldpm-${domains[0].replace(/\./g, "-")}-${ruleIndex}`,
							action: rule.action, // ALLOW, DENY, CHALLENGE
						};

						// Add path_regex if not matching everything
						if (rule.path && rule.path !== ".*") {
							botRule.path_regex = rule.path;
						}

						// Add user_agent_regex if present
						const userAgent = rule.userAgent || rule.user_agent;
						if (userAgent) {
							botRule.user_agent_regex = userAgent;
						}

						// Add Host header matching to scope rule to this domain
						if (domains.length === 1) {
							botRule.headers_regex = { Host: `^${domains[0].replace(/\./g, "\\.")}$` };
						} else {
							// Multiple domains: match any of them
							const hostPattern = domains.map((d) => d.replace(/\./g, "\\.")).join("|");
							botRule.headers_regex = { Host: `^(${hostPattern})$` };
						}

						policy.bots.push(botRule);
					}
				}
			}

			// Add a fallback placeholder if no rules exist (Anubis needs at least one)
			if (policy.bots.length === 0) {
				policy.bots.push({
					name: "shieldpm-placeholder",
					user_agent_regex: "^AnubisPlaceholderBot$",
					action: "DENY",
				});
			}

			// Write to file
			const yamlStr = yaml.dump(policy);
			fs.writeFileSync(POLICY_FILE, yamlStr);
			logger.info(`Anubis Policy written to ${POLICY_FILE}`);

			// Reload Anubis
			internalAnubis.reload();
		} catch (err) {
			logger.error("Failed to generate Anubis policy:", err);
		}
	},

	/**
	 * Reloads Anubis configuration
	 */
	reload: () => {
		exec("pkill -HUP anubis", (err) => {
			if (err) {
				// It's possible Anubis isn't running, which is fine
				// logger.warn("Could not reload Anubis:", err.message);
			} else {
				logger.info("Anubis configuration reloaded");
			}
		});
	},
};

export default internalAnubis;
