import { cleanup, render, screen } from "@testing-library/react";
import type { AuditLog } from "src/api/backend";
import { changeLocale } from "src/locale";
import { afterEach, describe, expect, it } from "vitest";
import { EventFormatter } from "./EventFormatter";

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
