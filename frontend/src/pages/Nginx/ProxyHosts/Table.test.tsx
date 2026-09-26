import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type React from "react";
import type { ProxyHost } from "src/api/backend";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Table from "./Table";

const monitorMocks = vi.hoisted(() => ({
	useProxyHostMonitorStatuses: vi.fn(),
}));

vi.mock("src/hooks/useProxyHostMonitor", () => ({
	useProxyHostMonitorStatuses: monitorMocks.useProxyHostMonitorStatuses,
}));

vi.mock("src/components", () => ({
	CertificateFormatter: () => null,
	DomainsFormatter: () => null,
	EmptyData: () => null,
	HasPermission: ({ children }: { children?: React.ReactNode }) => children,
	ServiceIcon: () => null,
	TrueFalseFormatter: ({ value }: { value: boolean }) => (
		<span>{value ? "reported-online" : "reported-offline"}</span>
	),
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
	zstdEnabled: false,
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
		monitorMocks.useProxyHostMonitorStatuses.mockReset();
		monitorMocks.useProxyHostMonitorStatuses.mockReturnValue({ data: [], isPending: false, isError: false });
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
	it("offers both one-time diagnostics and continuous monitoring in the same host menu", () => {
		render(<Table data={[proxyHost]} onEditAccessList={vi.fn()} />);
		fireEvent.pointerDown(screen.getByRole("button", { name: "Aktionsmenü öffnen" }), {
			button: 0,
			ctrlKey: false,
		});

		expect(screen.getByRole("menuitem", { name: "Host diagnostizieren" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Host-Überwachung" })).toBeInTheDocument();
	});
	it("reports an enabled proxy with failed Nginx activation as offline", () => {
		render(
			<Table
				data={[{ ...proxyHost, meta: { nginxOnline: false, nginxErr: "Invalid directive" } }]}
				onEditAccessList={vi.fn()}
			/>,
		);
		expect(screen.getByText("reported-offline")).toBeInTheDocument();
		expect(screen.getByTitle("Invalid directive")).toBeInTheDocument();
	});
	it("shows the latest up and down check durations in their own latency column using one batched request", () => {
		monitorMocks.useProxyHostMonitorStatuses.mockReturnValue({
			data: [
				{ hostId: 1, state: "down", checkedAt: "2026-01-01T00:00:00Z", responseMs: 96.4 },
				{ hostId: 2, state: "up", checkedAt: "2026-01-01T00:01:00Z", responseMs: 48.6 },
			],
			isPending: false,
			isError: false,
		});
		render(
			<Table
				data={[proxyHost, { ...proxyHost, id: 2, domainNames: ["second.test"] }]}
				onEditAccessList={vi.fn()}
			/>,
		);

		expect(monitorMocks.useProxyHostMonitorStatuses).toHaveBeenCalledTimes(1);
		expect(monitorMocks.useProxyHostMonitorStatuses).toHaveBeenCalledWith([1, 2]);
		expect(screen.getAllByText("reported-online")).toHaveLength(2);

		const headers = screen.getAllByRole("columnheader");
		const monitorIndex = headers.findIndex((header) => header.textContent === "Dienstprüfung");
		const latencyIndex = headers.findIndex((header) => header.textContent === "Latenz");
		expect(monitorIndex).toBeGreaterThanOrEqual(0);
		expect(latencyIndex).toBe(monitorIndex + 1);

		const [downRow, upRow] = screen.getAllByRole("row").slice(1);
		for (const [row, status, latency] of [
			[downRow, "Nicht erreichbar", "96 ms"],
			[upRow, "Erreichbar", "49 ms"],
		] as const) {
			const cells = within(row).getAllByRole("cell");
			expect(within(cells[monitorIndex]).getByText(status)).toBeInTheDocument();
			expect(within(cells[monitorIndex]).queryByText(/\bms\b/)).not.toBeInTheDocument();
			expect(cells[latencyIndex]).toHaveTextContent(latency);
		}
	});

	it.each([
		{
			caseName: "monitor without a configuration",
			data: [],
			isPending: false,
			isError: false,
			statusLabel: "Nicht eingerichtet",
		},
		{
			caseName: "paused monitor with a stale measurement",
			data: [{ hostId: 1, state: "paused", checkedAt: "2026-01-01T00:00:00Z", responseMs: 96 }],
			isPending: false,
			isError: false,
			statusLabel: "Pausiert",
		},
		{
			caseName: "monitor data still loading",
			data: [{ hostId: 1, state: "up", checkedAt: "2026-01-01T00:00:00Z", responseMs: 96 }],
			isPending: true,
			isError: false,
			statusLabel: "Prüfungen werden geladen…",
		},
		{
			caseName: "failed monitor summary request",
			data: [{ hostId: 1, state: "up", checkedAt: "2026-01-01T00:00:00Z", responseMs: 96 }],
			isPending: false,
			isError: true,
			statusLabel: "Status nicht verfügbar",
		},
	])("shows no latency for $caseName", ({ data, isPending, isError, statusLabel }) => {
		monitorMocks.useProxyHostMonitorStatuses.mockReturnValue({ data, isPending, isError });
		render(<Table data={[proxyHost]} onEditAccessList={vi.fn()} />);

		const headers = screen.getAllByRole("columnheader");
		const monitorIndex = headers.findIndex((header) => header.textContent === "Dienstprüfung");
		const latencyIndex = headers.findIndex((header) => header.textContent === "Latenz");
		const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
		expect(within(cells[monitorIndex]).getByText(statusLabel)).toBeInTheDocument();
		expect(cells[latencyIndex]).toHaveTextContent(/^–$/);
	});
});
