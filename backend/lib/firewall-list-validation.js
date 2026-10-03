import errs from "./error.js";
import { parseIpList } from "./firewall-addresses.js";
import { validateSourceUrl } from "./firewall-download.js";

const inputFields = [
	"name",
	"reason",
	"description",
	"source_type",
	"source_url",
	"update_interval_hours",
	"enabled",
	"entries",
];

/** Pure validation for API and backup imports; HTTPS metadata is checked without downloading. */
export const normalizeListInput = (data, previous = null) => {
	const combined = {
		name: "",
		reason: "",
		description: "",
		source_type: "manual",
		source_url: "",
		update_interval_hours: 24,
		enabled: true,
		entries: "",
	};
	for (const source of [previous, data]) {
		for (const field of inputFields) {
			if (source && Object.hasOwn(source, field)) combined[field] = source[field];
		}
	}
	/** @type {Array<[string, number]>} */
	const lengthLimits = [
		["name", 255],
		["reason", 2000],
		["description", 4000],
	];
	for (const [field, max] of lengthLimits) {
		if (typeof combined[field] !== "string" || combined[field].length > max || /\0/.test(combined[field])) {
			throw new errs.ValidationError(`Invalid firewall list ${field}`);
		}
	}
	if (!combined.name.trim() || !combined.reason.trim()) {
		throw new errs.ValidationError("Firewall lists require a name and public reason");
	}
	if (!["manual", "url"].includes(combined.source_type)) {
		throw new errs.ValidationError("Firewall source type must be manual or url");
	}
	if (typeof combined.enabled !== "boolean") throw new errs.ValidationError("Invalid firewall enabled value");
	if (
		!Number.isInteger(combined.update_interval_hours) ||
		combined.update_interval_hours < 6 ||
		combined.update_interval_hours > 168
	) {
		throw new errs.ValidationError("Firewall update interval must be between 6 and 168 hours");
	}
	if (combined.source_type === "url") validateSourceUrl(combined.source_url);
	else combined.source_url = "";
	const parsed = parseIpList(combined.entries);
	if (parsed.invalid.length) {
		throw new errs.ValidationError(
			`Invalid firewall list entries on line(s): ${parsed.invalid
				.slice(0, 10)
				.map((item) => item.line)
				.join(", ")}`,
		);
	}
	return { ...combined, entries: parsed.entries.join("\n"), entry_count: parsed.entries.length };
};
