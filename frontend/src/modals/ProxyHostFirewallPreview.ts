import type { FirewallList } from "src/api/backend/firewallLists";
import type { FirewallPolicy } from "src/api/backend/models";
import blockedPage from "../../../backend/templates/ip-blocked.html?raw";

type PreviewOptions = {
	policy: FirewallPolicy;
	lists?: Pick<FirewallList, "id" | "name" | "reason" | "enabled">[];
	host?: string;
	language?: string;
};

const htmlEntities: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => htmlEntities[character]);

const safeSupportUrl = (value: string): string => {
	const candidate = value.trim();
	try {
		const parsed = new URL(candidate);
		if (
			!["http:", "https:"].includes(parsed.protocol) ||
			parsed.username ||
			parsed.password ||
			/[\p{Cc}]/u.test(candidate)
		)
			return "";
		return candidate;
	} catch {
		return "";
	}
};

/** Render the actual public page with demonstration data; never interpolate an internal note. */
export const renderProxyHostFirewallPreview = ({
	policy,
	lists = [],
	host = "example.com",
	language = "en",
}: PreviewOptions): string => {
	const de = language.toLowerCase().startsWith("de");
	const manual = policy.denylist.find((rule) => rule.address.trim());
	const selected = policy.listIds.map((id) => lists.find((list) => list.id === id && list.enabled)).find(Boolean);
	const country = policy.countryDenylist[0] || (policy.blockUnknownCountry ? "XX" : "");
	const countryExample = !manual && !selected && country !== "";
	const countryDefaultReason =
		country === "XX"
			? de
				? "Das Land dieser IP-Adresse konnte nicht ermittelt werden. Dieser Betreiber sperrt Zugriffe mit unbekannter Länderzuordnung."
				: "The country of this IP address could not be determined. This operator blocks requests with unknown country assignment."
			: de
				? `Die IP-Adresse wird dem gesperrten Land ${country} zugeordnet. Der Betreiber schränkt Zugriffe aus diesem Land ein.`
				: `This IP address is assigned to the blocked country ${country}. The operator restricts access from this country.`;
	const defaultReason = de
		? "Die IP-Adresse ist durch eine Zugriffsregel dieser Website gesperrt."
		: "This IP address is blocked by an access rule for this website.";
	const support = safeSupportUrl(policy.supportUrl);
	const labels: Record<string, string> = de
		? {
				lang: "de",
				title: "Zugriff eingeschränkt",
				subtitle: "Diese Verbindung wurde durch die IP-Firewall geschützt.",
				reason_label: "Begründung",
				source_label: "Regel / Liste",
				ip_label: "Deine IP-Adresse",
				host_label: "Website",
				request_label: "Vorgangsnummer",
				contact_label: "Betreiber kontaktieren",
				footer: "Bei einer Rückfrage gib bitte die Vorgangsnummer an.",
			}
		: {
				lang: "en",
				title: "Access restricted",
				subtitle: "This connection was protected by the IP firewall.",
				reason_label: "Reason",
				source_label: "Rule / list",
				ip_label: "Your IP address",
				host_label: "Website",
				request_label: "Request ID",
				contact_label: "Contact the operator",
				footer: "Please include the request ID when asking for assistance.",
			};
	Object.assign(labels, {
		reason:
			(manual ? manual.reason : selected?.reason) ||
			(countryExample ? policy.countryReason || countryDefaultReason : defaultReason),
		message:
			policy.publicMessage ||
			(de
				? "Der Betreiber schränkt den Zugriff für dieses Netzwerk ein. Ein Listentreffer allein bedeutet nicht, dass ein Angriff stattgefunden hat."
				: "The website operator restricts access from this network. A list match alone does not mean an attack occurred."),
		source:
			!manual && selected
				? selected.name
				: countryExample
					? de
						? "GeoIP-Länderregel"
						: "GeoIP country rule"
					: de
						? "Manuelle IP-Sperre"
						: "Manual IP block",
		country_label: de ? "Erkanntes Land (ISO)" : "Detected country (ISO)",
		country: country === "XX" ? (de ? "Unbekannt (XX)" : "Unknown (XX)") : country,
		country_hidden: country ? "" : "hidden",
		ip: "203.0.113.42",
		host: host || "example.com",
		request: "PREVIEW-203011342",
		support,
		contact_hidden: support ? "" : "hidden",
	});
	return blockedPage.replace(/%\{([a-z_]+)\}/g, (_, key: string) => escapeHtml(labels[key] || ""));
};
