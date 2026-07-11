import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getAnalyticsSeries, getAnalyticsSummary, getDbStats } from "src/api/backend";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/api/backend", () => ({
	getAnalyticsSeries: vi.fn().mockResolvedValue([]),
	getAnalyticsSummary: vi.fn().mockResolvedValue({}),
	getDbStats: vi.fn().mockResolvedValue({}),
}));

vi.mock("src/components", () => ({
	Loading: () => null,
}));

vi.mock("src/hooks", () => ({
	useHealth: () => ({ data: undefined }),
	useProxyHosts: () => ({ data: [{ domainNames: ["example.com"], id: 1 }], isLoading: false }),
}));

vi.mock("src/components/ui/select", () => ({
	Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectValue: ({ placeholder }: { placeholder?: string }) => (
		<span data-testid="host-select-placeholder">{placeholder}</span>
	),
}));

vi.mock("react-simple-maps", () => ({
	ComposableMap: () => null,
	Geographies: () => null,
	Geography: () => null,
	Marker: () => null,
	ZoomableGroup: () => null,
}));

vi.mock("recharts", () => ({
	Area: () => null,
	AreaChart: () => null,
	Bar: () => null,
	BarChart: () => null,
	CartesianGrid: () => null,
	ResponsiveContainer: () => null,
	Tooltip: () => null,
	XAxis: () => null,
	YAxis: () => null,
}));

let visibilityStateDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
	visibilityStateDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
	vi.mocked(getAnalyticsSeries).mockReset();
	vi.mocked(getAnalyticsSeries).mockResolvedValue([]);
	vi.mocked(getAnalyticsSummary).mockReset();
	vi.mocked(getAnalyticsSummary).mockResolvedValue({});
	vi.mocked(getDbStats).mockReset();
	vi.mocked(getDbStats).mockResolvedValue({
		connections: { max: 1, open: 1, used: 1 },
		engine: "sqlite",
		io: { reads: 0, writes: 0 },
		size: 0,
	});
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue({ connections: { open: 1 }, io: {}, size: 0 }),
		}),
	);
});

afterEach(async () => {
	cleanup();
	if (visibilityStateDescriptor) {
		Object.defineProperty(document, "visibilityState", visibilityStateDescriptor);
	} else {
		Reflect.deleteProperty(document, "visibilityState");
	}
	vi.useRealTimers();
	vi.unstubAllGlobals();
	await changeLocale("en-US");
});

describe("Analytics", () => {
	it("loads database stats through the shared API client", async () => {
		vi.mocked(getDbStats).mockResolvedValue({
			connections: { max: 10, open: 2, used: 2 },
			engine: "sqlite",
			io: { reads: 3, writes: 4 },
			size: 2048,
		});
		const { default: Analytics } = await import("./index");

		render(<Analytics />);

		await screen.findByText("2 KB");
		expect(getDbStats).toHaveBeenCalledTimes(1);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("renders the host selector placeholder in the active locale", async () => {
		await changeLocale("de-DE");
		const { default: Analytics } = await import("./index");

		render(<Analytics />);

		expect(await screen.findByTestId("host-select-placeholder")).toHaveTextContent("Host auswählen");
	});

	it("renders recent request table headers in the active locale", async () => {
		await changeLocale("de-DE");
		vi.mocked(getAnalyticsSummary).mockResolvedValue({
			recentRequests: [
				{ duration: 42, ip: "192.0.2.1", method: "GET", path: "/", status: 200, time: "2026-01-01T12:00:00Z" },
			],
		});
		const { default: Analytics } = await import("./index");

		render(<Analytics />);

		await screen.findAllByText("Keine Daten zum Anzeigen");
		for (const header of ["Zeit", "Methode", "Status", "Pfad", "IP-Adresse", "Dauer"]) {
			expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
		}
	});

	it("keeps the latest range data when an older request completes last", async () => {
		let resolveFirstSummary: ((value: Awaited<ReturnType<typeof getAnalyticsSummary>>) => void) | undefined;
		const firstSummary = new Promise<Awaited<ReturnType<typeof getAnalyticsSummary>>>((resolve) => {
			resolveFirstSummary = resolve;
		});
		vi.mocked(getAnalyticsSummary)
			.mockResolvedValueOnce({ count: 50 })
			.mockReturnValueOnce(firstSummary)
			.mockResolvedValueOnce({ count: 200 });
		const { default: Analytics } = await import("./index");

		render(<Analytics />);

		await screen.findByText("50");
		fireEvent.click(screen.getByRole("button", { name: "1h" }));
		await waitFor(() => expect(getAnalyticsSummary).toHaveBeenCalledWith(1, "1h"));
		fireEvent.click(screen.getByRole("button", { name: "7d" }));
		await screen.findByText("200");

		if (!resolveFirstSummary) {
			throw new Error("Deferred summary resolver is unavailable");
		}
		resolveFirstSummary({ count: 100 });
		await firstSummary;
		await Promise.resolve();

		expect(getAnalyticsSeries).toHaveBeenCalledTimes(2);
		expect(screen.queryByText("100")).not.toBeInTheDocument();
	});

	it("does not poll analytics while the document is hidden", async () => {
		vi.useFakeTimers();
		Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
		const { default: Analytics } = await import("./index");

		render(<Analytics />);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(10000);
		});

		expect(getAnalyticsSummary).not.toHaveBeenCalled();
		expect(getAnalyticsSeries).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	});

	it("refreshes analytics after the document becomes visible", async () => {
		vi.useFakeTimers();
		Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
		const { default: Analytics } = await import("./index");

		render(<Analytics />);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(10000);
		});

		Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"));
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(getAnalyticsSummary).toHaveBeenCalledTimes(1);
		expect(getAnalyticsSeries).toHaveBeenCalledTimes(1);
		expect(getDbStats).toHaveBeenCalledTimes(1);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("keeps the latest analytics data after a tab visibility refresh", async () => {
		let resolveFirstSummary: ((value: Awaited<ReturnType<typeof getAnalyticsSummary>>) => void) | undefined;
		const firstSummary = new Promise<Awaited<ReturnType<typeof getAnalyticsSummary>>>((resolve) => {
			resolveFirstSummary = resolve;
		});
		vi.mocked(getAnalyticsSummary).mockReturnValueOnce(firstSummary).mockResolvedValueOnce({ count: 200 });
		const { default: Analytics } = await import("./index");

		render(<Analytics />);
		await waitFor(() => expect(getAnalyticsSummary).toHaveBeenCalledTimes(1));

		Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
		document.dispatchEvent(new Event("visibilitychange"));
		Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
		document.dispatchEvent(new Event("visibilitychange"));
		await screen.findByText("200");

		if (!resolveFirstSummary) {
			throw new Error("Deferred summary resolver is unavailable");
		}
		const resolveSummary = resolveFirstSummary;
		await act(async () => {
			resolveSummary({ count: 100 });
			await firstSummary;
			await Promise.resolve();
		});

		expect(getAnalyticsSeries).toHaveBeenCalledTimes(1);
		expect(screen.queryByText("100")).not.toBeInTheDocument();
	});

	it("keeps the latest live status after a tab visibility refresh", async () => {
		const createResponse = (data: unknown) => ({ ok: true, json: vi.fn().mockResolvedValue(data) });
		let resolveFirstLiveStatus: ((value: ReturnType<typeof createResponse>) => void) | undefined;
		const firstLiveStatus = new Promise<ReturnType<typeof createResponse>>((resolve) => {
			resolveFirstLiveStatus = resolve;
		});
		const fetchMock = vi
			.fn()
			.mockReturnValueOnce(firstLiveStatus)
			.mockResolvedValueOnce(createResponse({ total_sec: 4096 }))
			.mockResolvedValueOnce(createResponse({ connections: { open: 1 }, io: {}, size: 0 }))
			.mockResolvedValueOnce(createResponse({ connections: { open: 1 }, io: {}, size: 0 }));
		vi.stubGlobal("fetch", fetchMock);
		const { default: Analytics } = await import("./index");

		render(<Analytics />);
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

		Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
		document.dispatchEvent(new Event("visibilitychange"));
		Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
		document.dispatchEvent(new Event("visibilitychange"));
		await screen.findByText("4 KB/s");

		if (!resolveFirstLiveStatus) {
			throw new Error("Deferred live-status resolver is unavailable");
		}
		const resolveLiveStatus = resolveFirstLiveStatus;
		await act(async () => {
			resolveLiveStatus(createResponse({ total_sec: 1024 }));
			await firstLiveStatus;
			await Promise.resolve();
		});

		expect(screen.queryByText("1 KB/s")).not.toBeInTheDocument();
	});
});
