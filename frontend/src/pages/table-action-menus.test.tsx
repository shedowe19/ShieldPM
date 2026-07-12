import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import type { Certificate, DdnsProvider, DeadHost, RedirectionHost, Stream } from "src/api/backend";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CertificatesTable from "./Certificates/Table";
import DdnsProvidersTable from "./Nginx/DdnsProviders/Table";
import DeadHostsTable from "./Nginx/DeadHosts/Table";
import RedirectionHostsTable from "./Nginx/RedirectionHosts/Table";
import StreamsTable from "./Nginx/Streams/Table";

vi.mock("src/components", () => ({
	CertificateFormatter: () => null,
	CertificateInUseFormatter: () => null,
	DateFormatter: () => null,
	DomainsFormatter: () => null,
	EmptyData: () => null,
	HasPermission: ({ children }: { children?: React.ReactNode }) => children,
	TrueFalseFormatter: () => null,
	UserAvatar: () => null,
	ValueWithDateFormatter: () => null,
}));
vi.mock("src/components/HasPermission", () => ({
	HasPermission: ({ children }: { children?: React.ReactNode }) => children,
}));
vi.mock("./Certificates/lazy", () => ({
	showCustomCertificateModal: vi.fn(),
	showDNSCertificateModal: vi.fn(),
	showHTTPCertificateModal: vi.fn(),
	showInternalCertificateModal: vi.fn(),
}));

const certificate: Certificate = {
	createdOn: "2026-01-01T00:00:00Z",
	deadHosts: [],
	domainNames: ["certificate.example.test"],
	expiresOn: "2027-01-01T00:00:00Z",
	id: 1,
	meta: {},
	modifiedOn: "2026-01-01T00:00:00Z",
	niceName: "Certificate",
	ownerUserId: 1,
	provider: "other",
	proxyHosts: [],
	redirectionHosts: [],
	streams: [],
};

const deadHost: DeadHost = {
	advancedConfig: "",
	certificateId: 0,
	createdOn: "2026-01-01T00:00:00Z",
	domainNames: ["dead.example.test"],
	enabled: true,
	hstsEnabled: false,
	hstsSubdomains: false,
	http2Support: true,
	id: 2,
	meta: {},
	modifiedOn: "2026-01-01T00:00:00Z",
	ownerUserId: 1,
	sslForced: false,
};

const redirectionHost: RedirectionHost = {
	advancedConfig: "",
	blockExploits: true,
	certificateId: 0,
	createdOn: "2026-01-01T00:00:00Z",
	domainNames: ["redirect.example.test"],
	enabled: true,
	forwardDomainName: "destination.example.test",
	forwardHttpCode: 302,
	forwardScheme: "https",
	hstsEnabled: false,
	hstsSubdomains: false,
	http2Support: true,
	id: 3,
	meta: {},
	modifiedOn: "2026-01-01T00:00:00Z",
	ownerUserId: 1,
	preservePath: true,
	sslForced: false,
};

const ddnsProvider: DdnsProvider = {
	config: {},
	createdOn: "2026-01-01T00:00:00Z",
	domains: ["ddns.example.test"],
	enabled: true,
	id: 4,
	meta: {},
	modifiedOn: "2026-01-01T00:00:00Z",
	name: "Cloudflare",
	ownerUserId: 1,
	provider: "cloudflare",
};

const stream: Stream = {
	certificateId: 0,
	createdOn: "2026-01-01T00:00:00Z",
	enabled: true,
	forwardingHost: "127.0.0.1",
	forwardingPort: 8080,
	id: 5,
	incomingPort: 80,
	meta: {},
	modifiedOn: "2026-01-01T00:00:00Z",
	ownerUserId: 1,
	tcpForwarding: true,
	udpForwarding: false,
};

describe("table action menus", () => {
	beforeEach(async () => {
		await changeLocale("de");
	});

	afterEach(async () => {
		cleanup();
		await changeLocale("en");
	});

	it("gives every shared table action menu an explicit localized accessible name", () => {
		render(
			<>
				<CertificatesTable data={[certificate]} />
				<DeadHostsTable data={[deadHost]} />
				<RedirectionHostsTable data={[redirectionHost]} />
				<DdnsProvidersTable data={[ddnsProvider]} />
				<StreamsTable data={[stream]} />
			</>,
		);

		const actionMenus = screen.getAllByRole("button", { name: "Aktionsmenü öffnen" });
		expect(actionMenus).toHaveLength(5);
		for (const actionMenu of actionMenus) {
			expect(actionMenu).toHaveAttribute("aria-label", "Aktionsmenü öffnen");
		}
	});
});
