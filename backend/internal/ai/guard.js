/**
 * Hallucination guard.
 *
 * The previous guard only checked whether *any* tool ran. This one checks
 * whether the action the model claims in prose is backed by a matching,
 * successfully executed tool call.
 */

const CLAIM_RULES = [
	{
		expected: "delete_*",
		tools: [/^delete_/],
		patterns: [/\bdeleted\b/i, /\bremoved\b/i, /\bgelöscht\b/i, /\bentfernt\b/i],
	},
	{
		expected: "create_*/upload_*",
		tools: [/^create_/, /^upload_/],
		patterns: [
			/\bcreated\b(?!\s+(?:on|at)\b)/i,
			/\badded\b/i,
			/\berstellt\b/i,
			/\bangelegt\b/i,
			/\bhinzugefügt\b/i,
		],
	},
	{
		expected: "update_*/set_*",
		tools: [/^update_/, /^set_/, /^upload_/],
		patterns: [/\bupdated\b(?!\s+(?:on|at)\b)/i, /\bchanged\b/i, /\baktualisiert\b/i, /\bgeändert\b/i],
	},
	{
		expected: "enable_*/start_*",
		tools: [/^enable_/, /^start_/],
		patterns: [/\benabled\b/i, /\bactivated\b/i, /\baktiviert\b/i, /\beingeschaltet\b/i],
	},
	{
		expected: "disable_*/stop_*",
		tools: [/^disable_/, /^stop_/],
		patterns: [/\bdisabled\b/i, /\bdeactivated\b/i, /\bdeaktiviert\b/i, /\bausgeschaltet\b/i],
	},
	{
		expected: "renew_*",
		tools: [/^renew_/],
		patterns: [/\brenewed\b/i, /\berneuert\b/i],
	},
];

const NEGATION = /\b(?:not|never|no|none|nothing|nicht|kein(?:e|en|em)?|nie|nichts|niemand)\b[^.!?\n]{0,40}$/i;

const sentenceAround = (content, index) => {
	const start = Math.max(
		content.lastIndexOf(".", index),
		content.lastIndexOf("!", index),
		content.lastIndexOf("?", index),
		content.lastIndexOf("\n", index),
	);
	return content.slice(start + 1, index);
};

/**
 * Returns the claims for which no matching successful tool call exists.
 *
 * @param {string} content Final model answer
 * @param {Array<{tool: string, status: string}>} actions Executed tool calls
 * @returns {Array<{claim: string, expected: string}>}
 */
export const findUnverifiedClaims = (content, actions = []) => {
	if (typeof content !== "string" || content.length === 0) return [];
	const successful = actions.filter((action) => action && action.status === "success");
	const unverified = [];

	for (const rule of CLAIM_RULES) {
		for (const pattern of rule.patterns) {
			const globalPattern = new RegExp(pattern.source, `${pattern.flags.replace(/g/g, "")}g`);
			for (const match of content.matchAll(globalPattern)) {
				if (NEGATION.test(sentenceAround(content, match.index))) continue;
				const matched = successful.some((action) => rule.tools.some((tool) => tool.test(action.tool || "")));
				if (!matched) unverified.push({ claim: match[0], expected: rule.expected });
			}
		}
	}

	return unverified;
};

/**
 * Builds the warning prefix shown to the user.
 * @param {Array<{claim: string, expected: string}>} claims
 * @returns {string}
 */
export const buildHallucinationWarning = (claims) => {
	const expected = [...new Set(claims.map((claim) => claim.expected))].join(", ");
	return (
		`⚠️ WARNING: The AI claims to have performed an action, but no matching tool call succeeded (expected: ${expected}). ` +
		"Please verify the current state manually."
	);
};
