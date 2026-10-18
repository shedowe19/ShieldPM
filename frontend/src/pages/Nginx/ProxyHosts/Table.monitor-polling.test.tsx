import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ColumnVisibilityState } from "@tanstack/react-table";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import type { ProxyHost } from "src/api/backend";
import { useProxyHostMonitorStatuses } from "src/hooks/useProxyHostMonitor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Table from "./Table";

vi.mock("src/components", () => ({
	CertificateFormatter: () => null,
	DomainsFormatter: () => null,
	EmptyData: () => null,
	HasPermission: ({ children }: PropsWithChildren) => children,
	ServiceIcon: () => null,
	TrueFalseFormatter: () => null,
	UserAvatar: () => null,
}));
vi.mock("src/components/Table/Formatter/AccessListformatter", () => ({ AccessListFormatter: () => null }));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));
vi.mock("./MonitorDialog", () => ({ MonitorDialog: () => null }));
vi.mock("./ProxyHostDiagnosticsDialog", () => ({ ProxyHostDiagnosticsDialog: () => null }));

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
	createdOn: "2026-10-17T00:00:00Z",
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
	modifiedOn: "2026-10-17T00:00:00Z",
	ownerUserId: 1,
	securityCrowdsec: false,
	sslForced: false,
};
const hosts = [proxyHost];
const hidden = { monitor: false, latency: false };
let client: QueryClient;
const requests: { url: string; signal: AbortSignal | undefined }[] = [];
const heldResponses: (() => void)[] = [];
let holdRequests: boolean;

function response(responseMs: number) {
	return new Response(
		JSON.stringify([{ host_id: 1, state: "up", checked_at: "2026-10-17T16:00:00Z", response_ms: responseMs }]),
	);
}

beforeEach(() => {
	vi.useFakeTimers();
	focusManager.setFocused(true);
	onlineManager.setOnline(true);
	requests.length = 0;
	heldResponses.length = 0;
	holdRequests = false;
	client = new QueryClient({
		defaultOptions: { queries: { retry: false, staleTime: 60_000, refetchOnWindowFocus: true } },
	});
	vi.stubGlobal(
		"fetch",
		vi.fn((url: string, options: RequestInit) => {
			const signal = options.signal ?? undefined;
			requests.push({ url, signal });
			if (holdRequests) {
				const responseMs = requests.length * 10;
				return new Promise<Response>((resolve, reject) => {
					heldResponses.push(() => resolve(response(responseMs)));
					signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
						once: true,
					});
				});
			}
			return Promise.resolve(response(requests.length * 10));
		}),
	);
});
afterEach(() => {
	cleanup();
	client.clear();
	focusManager.setFocused(undefined);
	onlineManager.setOnline(true);
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

const advance = async (milliseconds: number) => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(milliseconds);
	});
};
function mount(columnVisibility: ColumnVisibilityState = {}) {
	const props = { data: hosts, onEditAccessList: vi.fn() };
	const table = (visibility: ColumnVisibilityState) => (
		<QueryClientProvider client={client}>
			<Table {...props} columnVisibility={visibility} />
		</QueryClientProvider>
	);
	const result = render(table(columnVisibility));
	return { ...result, show: (visibility: ColumnVisibilityState) => result.rerender(table(visibility)) };
}

describe("proxy host table monitor request counts", () => {
	it("sends no status requests while both columns are hidden, including focus, reconnect and invalidation", async () => {
		client.setQueryData(["proxy-host-monitors", "statuses", "1"], []);
		mount(hidden);
		await advance(90_000);
		await act(async () => {
			focusManager.setFocused(false);
			focusManager.setFocused(true);
			onlineManager.setOnline(false);
			onlineManager.setOnline(true);
			await client.invalidateQueries({ queryKey: ["proxy-host-monitors", "statuses"] });
		});
		await advance(1);

		expect(requests).toHaveLength(0);
	});

	it.each<ColumnVisibilityState>([{}, { monitor: true, latency: false }, { monitor: false, latency: true }])(
		"fetches immediately and every 30 seconds when a status column is visible (%j)",
		async (visibility) => {
			mount(visibility);
			await advance(1);
			expect(requests).toHaveLength(1);
			await advance(30_000);
			expect(requests).toHaveLength(2);
			await advance(30_000);
			expect(requests).toHaveLength(3);
			await advance(30_000);
			expect(requests).toHaveLength(4);
			expect(requests.map(({ url }) => url)).toEqual(
				Array(4).fill("/api/nginx/proxy-hosts/monitors/status?ids=1"),
			);
		},
	);

	it("refreshes a recently cached status immediately when a column is shown again", async () => {
		const table = mount();
		await advance(1);
		expect(screen.getByText("10 ms")).toBeInTheDocument();
		table.show(hidden);
		await advance(5_000);
		expect(requests).toHaveLength(1);
		table.show({ monitor: false, latency: true });
		await advance(1);

		expect(requests).toHaveLength(2);
		expect(screen.getByText("20 ms")).toBeInTheDocument();
	});

	it("aborts an unused in-flight request when both columns are hidden and resumes on reveal", async () => {
		holdRequests = true;
		const table = mount();
		await advance(1);
		expect(requests[0].signal?.aborted).toBe(false);
		table.show(hidden);
		expect(requests[0].signal?.aborted).toBe(true);
		await advance(90_000);
		expect(requests).toHaveLength(1);
		holdRequests = false;
		table.show({ monitor: false, latency: true });
		await advance(1);

		expect(requests).toHaveLength(2);
		expect(screen.getByText("20 ms")).toBeInTheDocument();
	});

	it("keeps a shared status request and polling alive for another active consumer", async () => {
		function OtherConsumer() {
			useProxyHostMonitorStatuses([1]);
			return null;
		}
		holdRequests = true;
		const table = (visibility: ColumnVisibilityState = {}) => (
			<QueryClientProvider client={client}>
				<Table data={hosts} columnVisibility={visibility} onEditAccessList={vi.fn()} />
				<OtherConsumer />
			</QueryClientProvider>
		);
		const mounted = render(table());
		await advance(1);
		mounted.rerender(table(hidden));
		expect(requests).toHaveLength(1);
		expect(requests[0].signal?.aborted).toBe(false);
		holdRequests = false;
		await act(async () => {
			heldResponses[0]();
		});
		await advance(30_000);
		expect(requests).toHaveLength(2);
		expect(requests[0].signal?.aborted).toBe(false);
	});
});
