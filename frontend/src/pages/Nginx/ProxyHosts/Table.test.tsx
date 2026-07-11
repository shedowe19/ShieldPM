import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import type { ProxyHost } from "src/api/backend";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Table from "./Table";

vi.mock("src/components", () => ({
	CertificateFormatter: () => null,
	DomainsFormatter: () => null,
	EmptyData: () => null,
	HasPermission: ({ children }: { children?: React.ReactNode }) => children,
	ServiceIcon: () => null,
	TrueFalseFormatter: () => null,
	UserAvatar: () => null,
}));

vi.mock("src/components/Table/Formatter/AccessListformatter", () => ({
	AccessListFormatter: () => null,
}));

const proxyHost: ProxyHost = {
	accessListId: 0,
	advancedConfig: "",
	allowWebsocketUpgrade: true,
	anubisEnabled: false,
	bandwidthLimit: "",
	blockExploits: true,
	cachingEnabled: false,
	certificateId: 0,
	createdOn: "2026-01-01T00:00:00Z",
	disableBuffering: false,
	domainNames: ["example.test"],
	enabled: true,
	forwardHost: "127.0.0.1",
	forwardPort: 8080,
	forwardScheme: "http",
	hstsEnabled: false,
	hstsSubdomains: false,
	http2Support: true,
	id: 1,
	maintenanceActive: false,
	maintenanceOnFailure: false,
	meta: {},
	modifiedOn: "2026-01-01T00:00:00Z",
	ownerUserId: 1,
	securityCrowdsec: false,
	sslForced: false,
};

describe("Proxy hosts table", () => {
	beforeEach(async () => {
		await changeLocale("de");
	});

	afterEach(async () => {
		cleanup();
		await changeLocale("en");
	});

	it("gives each row action menu an explicit localized accessible name", () => {
		render(<Table data={[proxyHost]} onEditAccessList={vi.fn()} />);

		expect(screen.getByRole("button", { name: "Aktionsmenü öffnen" })).toHaveAttribute(
			"aria-label",
			"Aktionsmenü öffnen",
		);
	});
});
