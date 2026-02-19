import { exec } from "node:child_process";
import fs from "node:fs";
import yaml from "js-yaml";
import { internal as logger } from "../logger.js";
import ProxyHost from "../models/proxy_host.js";

const POLICY_FILE = "/data/anubis/policy.yaml";

const DEFAULT_RULES = [
	{
		path: ".*",
		action: "DENY",
		user_agent: "(?i)GPTBot|CCBot|PerplexityBot|Anthropic-ai|Claude-Web|Google-Extended|Bytespider|Amazonbot|FacebookBot",
		comment: "Block AI Crawlers and Aggressive Scrapers",
	},
];

const internalAnubis = {
	/**
	 * Generates the Anubis policy.yaml from database
	 * @returns {Promise<void>}
	 */
	generatePolicy: async () => {
		try {
			logger.info("Generating Anubis Policy...");

			// Fetch all enabled proxy hosts with Anubis enabled
			const hosts = await ProxyHost.query().where("is_deleted", 0).where("enabled", 1).where("anubis_enabled", 1);

			const policy = {
				bots: [
					// Anubis requires at least one bot rule to start
					{
						name: "AnubisPlaceholderBot",
						user_agent_regex: "^AnubisPlaceholderBot$",
						action: "DENY",
					},
				],
				rules: [],
			};

			// 1. Add Per-Host Rules
			for (const host of hosts) {
				// Use bracket notation to avoid TS property check in JS
				let rules = host["anubis_rules"];

				// Use Default Rules if none defined but Anubis is enabled
				if (!rules || !Array.isArray(rules) || rules.length === 0) {
					rules = DEFAULT_RULES;
				}

				if (rules && Array.isArray(rules)) {
					for (const rule of rules) {
						if (!rule.path || !rule.action) continue;

						// Construct CEL expression for Host matching + Path matching
						// request.host == 'example.com' && request.path.matches('^/admin.*')
						const domains = host.domain_names;
						if (!domains || domains.length === 0) continue;

						// Create a CEL expression that matches ANY of the domains
						// (request.host == 'a.com' || request.host == 'b.com')
						const domainExpr = domains.map((d) => `request.host == '${d}'`).join(" || ");

						let expression = `(${domainExpr}) && request.path.matches('${rule.path}')`;

						// Add User-Agent check if present
						if (rule.user_agent) {
							expression += ` && request.user_agent.matches('${rule.user_agent}')`;
						}

						// Add Header checks if present
						if (rule.headers) {
							// TODO: Implement header matching in CEL if needed
						}

						policy.rules.push({
							action: rule.action, // ALLOW, DENY, CHALLENGE
							expression: expression,
							comment: `Host: ${domains[0]}, Rule: ${rule.path}`,
						});
					}
				}
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
