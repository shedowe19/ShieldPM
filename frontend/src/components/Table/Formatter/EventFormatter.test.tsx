import { cleanup, render, screen } from "@testing-library/react";
import type { AuditLog } from "src/api/backend";
import { changeLocale } from "src/locale";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";
import { afterEach, describe, expect, it } from "vitest";
import { EventFormatter } from "./EventFormatter";

const getBadgeByText = (text: string) => screen.getByText(text).closest("div");

const firewallListMeta = {
	id: 12,
	createdOn: "2026-10-04T12:00:00.000Z",
	modifiedOn: "2026-10-04T12:10:00.000Z",
	ownerUserId: 1,
	name: "VPN Exit Nodes",
	reason: "VPN networks are restricted.",
	description: "Imported public network list",
	sourceType: "url",
	sourceUrl: "https://example.com/vpn.txt",
	updateIntervalHours: 24,
	enabled: true,
	entryCount: 42,
	lastUpdatedOn: "2026-10-04T12:10:00.000Z",
	lastError: null,
};

const auditEvent = (action: string, meta: Record<string, unknown> = firewallListMeta): AuditLog => ({
	id: 73,
	createdOn: "2026-10-04T12:10:00.000Z",
	modifiedOn: "2026-10-04T12:10:00.000Z",
	userId: 1,
	objectType: "firewall-list",
	objectId: 12,
	action,
	meta,
});

const operations = [
	{
		operation: "create",
		action: "created",
		meta: { ...firewallListMeta, sourceType: "manual", sourceUrl: "", lastUpdatedOn: null },
		de: "Firewall-Liste erstellt",
		en: "Created Firewall List",
		color: "text-green-500",
	},
	{
		operation: "update",
		action: "updated",
		meta: { ...firewallListMeta, name: "Renamed VPN List" },
		de: "Firewall-Liste aktualisiert",
		en: "Updated Firewall List",
		color: "text-blue-500",
	},
	{
		operation: "delete",
		action: "deleted",
		meta: firewallListMeta,
		de: "Firewall-Liste gelöscht",
		en: "Deleted Firewall List",
		color: "text-destructive",
	},
	{
		operation: "refresh",
		action: "updated",
		meta: { ...firewallListMeta, entryCount: 84, lastUpdatedOn: "2026-10-04T12:20:00.000Z" },
		de: "Firewall-Liste aktualisiert",
		en: "Updated Firewall List",
		color: "text-blue-500",
	},
];

afterEach(async () => {
	cleanup();
	await changeLocale("en");
});

describe.each(["de", "en"] as const)("Firewall list audit events in %s", (locale) => {
	it.each(operations)("renders a $operation event with the saved name and shield", async (operation) => {
		await changeLocale(locale);

		const { container } = render(<EventFormatter row={auditEvent(operation.action, operation.meta)} />);

		expect(screen.getByText(operation[locale], { exact: false })).toBeInTheDocument();
		expect(screen.getByText(operation.meta.name)).toHaveClass("bg-secondary");
		expect(container.querySelector(".tabler-icon-shield")).toHaveClass(operation.color);
		expect(screen.queryByText(/UNKNOWN EVENT TYPE/)).not.toBeInTheDocument();
		expect(screen.queryByText(firewallListMeta.reason)).not.toBeInTheDocument();
	});
});

describe("Audit event names", () => {
	it("shows the existing fallback when a firewall list name is missing", async () => {
		await changeLocale("en");

		render(<EventFormatter row={auditEvent("deleted", {})} />);

		expect(screen.getByText("N/A")).toBeInTheDocument();
		expect(screen.getByText("Deleted Firewall List", { exact: false })).toBeInTheDocument();
		expect(screen.queryByText(/UNKNOWN EVENT TYPE/)).not.toBeInTheDocument();
	});

	it("renders an untrusted list name as text", async () => {
		await changeLocale("en");
		const name = '<img src="x" onerror="alert(1)">';

		const { container } = render(<EventFormatter row={auditEvent("created", { ...firewallListMeta, name })} />);

		expect(screen.getByText(name)).toBeInTheDocument();
		expect(container.querySelector("img")).toBeNull();
	});

	it.each([
		{ objectType: "access-list", meta: { name: "Office Access" }, label: "Office Access", icon: "lock" },
		{
			objectType: "proxy-host",
			meta: { domainNames: ["example.com", "www.example.com"] },
			label: "example.com, www.example.com",
			icon: "bolt",
		},
	])("keeps the existing $objectType name and icon", async ({ objectType, meta, label, icon }) => {
		await changeLocale("en");

		const { container } = render(<EventFormatter row={{ ...auditEvent("updated", meta), objectType }} />);

		expect(screen.getByText(label)).toBeInTheDocument();
		expect(container.querySelector(`.tabler-icon-${icon}`)).toBeInTheDocument();
	});
});

const resourceEvents = [
	{
		type: "access-list",
		meta: { name: "Office Access" },
		value: "Office Access",
		de: "Zugriffsliste",
		en: "Access List",
	},
	{
		type: "firewall-list",
		meta: { name: "VPN Networks" },
		value: "VPN Networks",
		de: "Firewall-Liste",
		en: "Firewall List",
	},
	{ type: "user", meta: { name: "Administrator" }, value: "Administrator", de: "User", en: "User" },
	{
		type: "proxy-host",
		meta: { domainNames: ["proxy.test"] },
		value: "proxy.test",
		de: "Proxy Host",
		en: "Proxy Host",
	},
	{
		type: "redirection-host",
		meta: { domainNames: ["redirect.test"] },
		value: "redirect.test",
		de: "Redirection Host",
		en: "Redirection Host",
	},
	{ type: "dead-host", meta: { domainNames: ["404.test"] }, value: "404.test", de: "404 Host", en: "404 Host" },
	{ type: "stream", meta: { incomingPort: 3306 }, value: "3306", de: "Stream", en: "Stream" },
	{
		type: "certificate",
		meta: { domainNames: ["certificate.test"] },
		value: "certificate.test",
		de: "Zertifikat",
		en: "Certificate",
	},
	{
		type: "ddns-provider",
		meta: { name: "DDNS Router" },
		value: "DDNS Router",
		de: "DDNS-Anbieter",
		en: "DDNS Provider",
	},
	{
		type: "terminal-host",
		meta: { name: "SSH Server" },
		value: "SSH Server",
		de: "Terminal-Host",
		en: "Terminal Host",
	},
	{
		type: "cloudflared-tunnel",
		meta: { name: "Cloudflare Edge" },
		value: "Cloudflare Edge",
		de: "Cloudflare Tunnel",
		en: "Cloudflare Tunnels",
	},
	{
		type: "setting",
		meta: {
			settingId: "default-site",
			name: "Default Site",
			description: "Default site configuration",
			value: "SETTING_VALUE_SENTINEL",
		},
		value: "Default Site",
		de: "Einstellung",
		en: "Setting",
	},
	{
		type: "dashboard_note",
		meta: { content: "Service maintenance" },
		value: "Service maintenance",
		de: "Notiz",
		en: "Dashboard Note",
	},
	{
		type: "tor-onion",
		meta: { name: "Onion service", onionAddress: "onion.test" },
		value: "onion.test",
		de: "Tor-Onion",
		en: "Tor-Onion",
	},
	{
		type: "wireguard-peer",
		meta: { name: "Travel Laptop", clientAddress: "10.8.0.2/32" },
		value: "Travel Laptop",
		de: "WireGuard-Peer",
		en: "WireGuard peer",
	},
	{
		type: "wireguard-settings",
		meta: { endpoint: "vpn.test", listenPort: 51820, subnet: "10.8.0.0/24", serverAddress: "10.8.0.1" },
		value: "",
		de: "WireGuard-Einstellungen",
		en: "WireGuard settings",
	},
];

describe("All supported audit resources", () => {
	it("keeps the resource regression fixtures complete when an object type is added", () => {
		expect(resourceEvents.map((event) => event.type).sort()).toEqual(Object.values(AUDIT_LOG_OBJECT_TYPE).sort());
	});

	describe.each(["de", "en"] as const)("in %s", (locale) => {
		it.each(resourceEvents)("renders $type with a translated heading, badge, and icon", async (event) => {
			await changeLocale(locale);
			const { container } = render(
				<EventFormatter row={{ ...auditEvent("updated", event.meta), objectType: event.type }} />,
			);

			const label = event[locale];
			expect(
				screen.getByText(locale === "de" ? `${label} aktualisiert` : `Updated ${label}`),
			).toBeInTheDocument();
			expect(getBadgeByText(event.value || label)).toHaveClass("bg-secondary");
			expect(container.querySelector("svg")).toBeInTheDocument();
			expect(screen.queryByText("SETTING_VALUE_SENTINEL")).not.toBeInTheDocument();
			expect(
				screen.queryByText(/UNKNOWN EVENT TYPE|Unknown object type|Unbekannter Objekttyp/),
			).not.toBeInTheDocument();
		});
	});
});

const wireguardOperations = [
	{
		operation: "create",
		action: "created",
		meta: { name: "Travel Laptop", clientAddress: "10.8.0.2/32" },
		de: "erstellt",
		en: "Created",
	},
	{ operation: "update", action: "updated", meta: { name: "Travel Laptop" }, de: "aktualisiert", en: "Updated" },
	{
		operation: "delete",
		action: "deleted",
		meta: { name: "Travel Laptop", clientAddress: "10.8.0.2/32" },
		de: "gelöscht",
		en: "Deleted",
	},
	{
		operation: "enable",
		action: "updated",
		meta: { name: "Travel Laptop", status: "enabled" },
		de: "aktualisiert",
		en: "Updated",
	},
	{
		operation: "disable",
		action: "updated",
		meta: { name: "Travel Laptop", status: "disabled" },
		de: "aktualisiert",
		en: "Updated",
	},
];

describe.each(["de", "en"] as const)("WireGuard audit operations in %s", (locale) => {
	it.each(wireguardOperations)(
		"renders the real $operation payload without treating status as an audit action",
		async (event) => {
			await changeLocale(locale);
			const { container } = render(
				<EventFormatter row={{ ...auditEvent(event.action, event.meta), objectType: "wireguard-peer" }} />,
			);

			expect(
				screen.getByText(locale === "de" ? `WireGuard-Peer ${event.de}` : `${event.en} WireGuard peer`),
			).toBeInTheDocument();
			expect(screen.getByText("Travel Laptop")).toHaveClass("bg-secondary");
			expect(container.querySelector(".tabler-icon-shield")).toBeInTheDocument();
			expect(screen.queryByText("10.8.0.2/32")).not.toBeInTheDocument();
		},
	);

	it("uses a fixed settings badge and never exposes keys or configuration as a row name", async () => {
		await changeLocale(locale);
		render(
			<EventFormatter
				row={{
					...auditEvent("updated", {
						endpoint: "private-vpn.test",
						listenPort: 51820,
						subnet: "10.8.0.0/24",
						serverAddress: "10.8.0.1",
						privateKey: "PRIVATE_KEY_SENTINEL",
						clientPrivateKey: "CLIENT_KEY_SENTINEL",
						presharedKey: "PRESHARED_KEY_SENTINEL",
						config: "CONFIG_SENTINEL",
						name: "CONFIG_NAME_SENTINEL",
					}),
					objectType: "wireguard-settings",
				}}
			/>,
		);

		expect(getBadgeByText(locale === "de" ? "WireGuard-Einstellungen" : "WireGuard settings")).toHaveClass(
			"bg-secondary",
		);
		expect(screen.queryByText(/SENTINEL|private-vpn\.test|10\.8\./)).not.toBeInTheDocument();
	});

	it.each([undefined, null, "", " ", 42])("falls back to the peer identifier when the name is %s", async (name) => {
		await changeLocale(locale);
		render(
			<EventFormatter
				row={{ ...auditEvent("deleted", { name, privateKey: "KEY_SENTINEL" }), objectType: "wireguard-peer" }}
			/>,
		);

		expect(getBadgeByText("Peer #12")).toHaveClass("bg-secondary");
		expect(screen.queryByText("KEY_SENTINEL")).not.toBeInTheDocument();
	});
});

describe.each(["de", "en"] as const)("Unrecognized audit resources in %s", (locale) => {
	it.each([
		"future-resource",
		"__proto__",
		"constructor",
		"toString",
		'<img src="x" onerror="alert(1)">',
		null,
		undefined,
		"",
		" ",
	])("keeps %s explicit and does not guess from metadata", async (objectType) => {
		await changeLocale(locale);
		const row = {
			...auditEvent("updated", { name: "METADATA_SENTINEL", privateKey: "KEY_SENTINEL" }),
			objectType,
		} as unknown as AuditLog;
		const { container } = render(<EventFormatter row={row} />);

		expect(screen.getByText(locale === "de" ? "Ereignis aktualisiert" : "Updated Event")).toBeInTheDocument();
		const type = objectType?.trim() ? objectType : "N/A";
		expect(
			getBadgeByText(locale === "de" ? `Unbekannter Objekttyp: ${type}` : `Unknown object type: ${type}`),
		).toHaveClass("bg-secondary");
		expect(container.querySelector(".tabler-icon-history")).toBeInTheDocument();
		expect(container.querySelector("img")).toBeNull();
		expect(screen.queryByText(/SENTINEL|UNKNOWN EVENT TYPE/)).not.toBeInTheDocument();
	});
});

describe.each(["de", "en"] as const)("Other backend audit actions in %s", (locale) => {
	it.each([
		{
			action: "enabled",
			objectType: "proxy-host",
			meta: { domainNames: ["proxy.test"] },
			de: "Proxy Host aktiviert",
			en: "Enabled Proxy Host",
			value: "proxy.test",
		},
		{
			action: "disabled",
			objectType: "proxy-host",
			meta: { domainNames: ["proxy.test"] },
			de: "Proxy Host deaktiviert",
			en: "Disabled Proxy Host",
			value: "proxy.test",
		},
		{
			action: "renewed",
			objectType: "certificate",
			meta: { niceName: "Imported Certificate" },
			de: "Zertifikat erneuert",
			en: "Renewed Certificate",
			value: "Imported Certificate",
		},
	])("keeps $action as a recognized localized audit action", async (event) => {
		await changeLocale(locale);
		const { container } = render(
			<EventFormatter row={{ ...auditEvent(event.action, event.meta), objectType: event.objectType }} />,
		);

		expect(screen.getByText(event[locale])).toBeInTheDocument();
		expect(getBadgeByText(event.value)).toHaveClass("bg-secondary");
		expect(container.querySelector("svg")).toHaveClass("text-blue-500");
	});

	it("localizes the fallback for a note without content", async () => {
		await changeLocale(locale);
		render(<EventFormatter row={{ ...auditEvent("deleted", {}), objectType: "dashboard_note" }} />);

		expect(getBadgeByText(locale === "de" ? "Notiz" : "Dashboard Note")).toHaveClass("bg-secondary");
	});
});
