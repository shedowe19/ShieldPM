import countryCodeSchema from "../schema/components/firewall-country-code.json" with { type: "json" };
import errs from "./error.js";
import { normalizeAddress } from "./firewall-addresses.js";

// Shared with API validation; includes the Kosovo XK extension present in the existing GeoIP dataset.
export const FIREWALL_COUNTRY_CODES = Object.freeze(countryCodeSchema.enum);
const countryCodes = new Set(FIREWALL_COUNTRY_CODES);

const MAX_RULES = 1000;
const fields = new Set([
	"enabled",
	"list_ids",
	"allowlist",
	"denylist",
	"public_message",
	"support_url",
	"internal_note",
	"country_denylist",
	"country_reason",
	"block_unknown_country",
]);

const text = (value, name, maximum) => {
	if (value === undefined) return "";
	if (typeof value !== "string" || value.length > maximum || value.includes("\0")) {
		throw new errs.ValidationError(`Firewall ${name} must be text of at most ${maximum} characters`);
	}
	return value.trim();
};

/** Validate and normalize a host's JSON firewall settings without expanding CIDR networks. */
export const normalizeFirewallPolicy = (value) => {
	if (typeof value === "undefined") return undefined;
	if (
		!value ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		Object.keys(value).some((key) => !fields.has(key))
	) {
		throw new errs.ValidationError("Invalid IP firewall settings");
	}
	if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
		throw new errs.ValidationError("Firewall enabled must be a boolean");
	}
	if (value.block_unknown_country !== undefined && typeof value.block_unknown_country !== "boolean") {
		throw new errs.ValidationError("Firewall block unknown country must be a boolean");
	}
	const countries = value.country_denylist === undefined ? [] : value.country_denylist;
	if (!Array.isArray(countries) || countries.length > FIREWALL_COUNTRY_CODES.length) {
		throw new errs.ValidationError("Firewall country denylist must contain at most 250 country codes");
	}
	const countryDenylist = [
		...new Set(
			countries.map((country) => {
				if (typeof country !== "string" || !countryCodes.has(country.trim().toUpperCase())) {
					throw new errs.ValidationError("Firewall countries must use valid ISO alpha-2 codes or XK");
				}
				return country.trim().toUpperCase();
			}),
		),
	];
	const listIds = value.list_ids ?? [];
	if (!Array.isArray(listIds) || listIds.length > 32 || listIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
		throw new errs.ValidationError("Firewall list IDs must be positive integers (maximum 32)");
	}
	const allowed = value.allowlist ?? [];
	const denied = value.denylist ?? [];
	if (!Array.isArray(allowed) || !Array.isArray(denied) || allowed.length > MAX_RULES || denied.length > MAX_RULES) {
		throw new errs.ValidationError(`Firewall permits at most ${MAX_RULES} manual rules and exceptions`);
	}
	const allowlist = [...new Set(allowed.map((address) => normalizeAddress(address)))];
	const seen = new Set();
	const denylist = denied.map((rule) => {
		if (
			!rule ||
			typeof rule !== "object" ||
			Array.isArray(rule) ||
			Object.keys(rule).some((key) => !["address", "reason"].includes(key))
		) {
			throw new errs.ValidationError("Firewall deny rules require an IP address and an optional public reason");
		}
		const address = normalizeAddress(rule.address);
		if (seen.has(address)) throw new errs.ValidationError(`Duplicate firewall rule: ${address}`);
		seen.add(address);
		return { address, reason: text(rule.reason, "reason", 1000) };
	});
	const supportUrl = text(value.support_url, "support URL", 2048);
	if (supportUrl) {
		let url;
		try {
			url = new URL(supportUrl);
		} catch {
			/* Report the validation error below. */
		}
		if (
			!url ||
			!["http:", "https:"].includes(url.protocol) ||
			url.username ||
			url.password ||
			/[\p{Cc}]/u.test(supportUrl)
		) {
			throw new errs.ValidationError("Firewall support URL must be an HTTP(S) URL without credentials");
		}
	}
	return {
		enabled: value.enabled ?? false,
		list_ids: [...new Set(listIds)],
		allowlist,
		denylist,
		public_message: text(value.public_message, "public message", 2000),
		support_url: supportUrl,
		internal_note: text(value.internal_note, "internal note", 2000),
		country_denylist: countryDenylist,
		country_reason: text(value.country_reason, "country reason", 1000),
		block_unknown_country: value.block_unknown_country ?? false,
	};
};
