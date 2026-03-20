/**
 * Build the Anubis policy object from proxy-host rows.
 * Pure function — no I/O, no side effects.
 */
const escapeRegex = (s) => s.replace(/\\/g, "\\\\").replace(/\./g, "\\.");

const buildPolicy = (hosts) => {
	const bots = [];
	let ruleIndex = 0;

	for (const host of hosts) {
		const rules = host.anubis_rules;
		if (!rules || !Array.isArray(rules)) continue;

		for (const rule of rules) {
			if (!rule.action) continue;

			const domains = host.domain_names;
			if (!domains || domains.length === 0) continue;

			ruleIndex++;

			const ruleName = rule.name || rule.ruleName || `shieldpm-${domains[0].replace(/\./g, "-")}-${ruleIndex}`;

			const botRule = { name: ruleName, action: rule.action };

			// path_regex
			const path = rule.path || rule.pathRegex;
			if (path && path !== ".*") botRule.path_regex = path;

			// user_agent_regex
			const userAgent = rule.userAgent || rule.user_agent;
			if (userAgent) botRule.user_agent_regex = userAgent;

			// remote_addresses
			const remoteAddresses = rule.remoteAddresses || rule.remote_addresses;
			if (remoteAddresses && Array.isArray(remoteAddresses) && remoteAddresses.length > 0) {
				botRule.remote_addresses = remoteAddresses;
			}

			// headers_regex — scope to host domains via X-Shieldpm-Host
			const headers = {};
			if (domains.length === 1) {
				headers["X-Shieldpm-Host"] = `^${escapeRegex(domains[0])}$`;
			} else {
				headers["X-Shieldpm-Host"] = `^(${domains.map((d) => escapeRegex(d)).join("|")})$`;
			}

			// merge user-defined headers
			const userHeaders = rule.headersRegex || rule.headers_regex;
			if (userHeaders && typeof userHeaders === "object") Object.assign(headers, userHeaders);

			botRule.headers_regex = headers;

			// challenge settings
			if (rule.action === "CHALLENGE") {
				const difficulty = rule.challengeDifficulty || rule.challenge_difficulty;
				const algorithm = rule.challengeAlgorithm || rule.challenge_algorithm;
				if (difficulty || algorithm) {
					botRule.challenge = {};
					if (difficulty) botRule.challenge.difficulty = Number(difficulty);
					if (algorithm) botRule.challenge.algorithm = algorithm;
				}
			}

			bots.push(botRule);
		}
	}

	// Anubis needs at least one rule
	if (bots.length === 0) {
		bots.push({ name: "shieldpm-placeholder", user_agent_regex: "^AnubisPlaceholderBot$", action: "DENY" });
	}

	return { bots };
};

export { buildPolicy };
