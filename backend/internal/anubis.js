import { exec } from "node:child_process";
import fs from "node:fs";
import * as yaml from "js-yaml";
import _ from "lodash";
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
	 *   - name: unique kebab-case identifier (exposed in Prometheus metrics)
	 *   - user_agent_regex: regex to match User-Agent header
	 *   - path_regex: regex to match request path
	 *   - headers_regex: object of header_name -> regex pairs
	 *   - remote_addresses: array of CIDR ranges for IP filtering
	 *   - action: ALLOW | DENY | CHALLENGE
	 *   - challenge: { difficulty, algorithm } (only for CHALLENGE action)
	 *
	 * @returns {Promise<void>}
	 */
	generatePolicy: _.debounce(async () => {
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
				const rules = host.anubis_rules; // eslint-disable-line dot-notation

				if (rules && Array.isArray(rules)) {
					for (const rule of rules) {
						if (!rule.action) continue;

						const domains = host.domain_names;
						if (!domains || domains.length === 0) continue;

						ruleIndex++;

						// Generate a name: user-provided or auto-generated
						const ruleName =
							rule.name ||
							rule.ruleName ||
							`shieldpm-${domains[0].replace(/[^a-z0-9-]/gi, "-")}-${ruleIndex}`;

						const botRule = {
							name: ruleName,
							action: rule.action,
						};

						// Add path_regex if present and not matching everything
						const path = rule.path || rule.pathRegex;
						if (path && path !== ".*") {
							botRule.path_regex = path;
						}

						// Add user_agent_regex if present
						const userAgent = rule.userAgent || rule.user_agent;
						if (userAgent) {
							botRule.user_agent_regex = userAgent;
						}

						// Add remote_addresses for IP filtering
						const remoteAddresses = rule.remoteAddresses || rule.remote_addresses;
						if (remoteAddresses && Array.isArray(remoteAddresses) && remoteAddresses.length > 0) {
							botRule.remote_addresses = remoteAddresses;
						}

						// Scope rule to this host's domain(s) via custom header.
						// Note: Standard "Host" header is invisible to Go's Request.Header
						// (Go stores it in Request.Host), so Anubis headers_regex can't match it.
						// We use the custom "X-ShieldPM-Host" header set by the Nginx frontend block.
						const headers = {};
						const escapeRegex = (s) => s.replace(/\\/g, "\\\\").replace(/\./g, "\\.");
						if (domains.length === 1) {
							headers["X-Shieldpm-Host"] = `^${escapeRegex(domains[0])}$`;
						} else {
							const hostPattern = domains.map((d) => escapeRegex(d)).join("|");
							headers["X-Shieldpm-Host"] = `^(${hostPattern})$`;
						}

						// Merge user-defined headers_regex if present
						const userHeaders = rule.headersRegex || rule.headers_regex;
						if (userHeaders && typeof userHeaders === "object") {
							Object.assign(headers, userHeaders);
						}

						botRule.headers_regex = headers;

						// Add challenge settings (only relevant for CHALLENGE action)
						if (rule.action === "CHALLENGE") {
							const difficulty = rule.challengeDifficulty || rule.challenge_difficulty;
							const algorithm = rule.challengeAlgorithm || rule.challenge_algorithm;

							if (difficulty || algorithm) {
								botRule.challenge = {};
								if (difficulty) botRule.challenge.difficulty = Number(difficulty);
								if (algorithm) botRule.challenge.algorithm = algorithm;
							}
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
	}, 2000),

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
