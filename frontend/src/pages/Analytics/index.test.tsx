import { act, cleanup, fireEvent, screen, render as testingLibraryRender, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { getAnalyticsSeries, getAnalyticsSummary, getDbStats } from "src/api/backend";
import { getAnalyticsStatus } from "src/api/backend/getAnalyticsStatus";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/api/backend", () => ({
	getAnalyticsSeries: vi.fn().mockResolvedValue([]),
	getAnalyticsSummary: vi.fn().mockResolvedValue({}),
	getDbStats: vi.fn().mockResolvedValue({}),
}));

vi.mock("src/api/backend/getAnalyticsStatus", () => ({
	getAnalyticsStatus: vi.fn().mockResolvedValue({ rxSec: 0, totalSec: 0, txSec: 0 }),
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

vi.mock("recharts", () => ({
	Area: () => null,
	AreaChart: () => <div data-testid="analytics-area-chart" />,
	Bar: () => null,
	BarChart: () => <div data-testid="analytics-bar-chart" />,
	CartesianGrid: () => null,
	ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	Tooltip: () => null,
	XAxis: () => null,
	YAxis: () => null,
}));

const LocationProbe = () => {
	const location = useLocation();
	return <output data-testid="analytics-location">{location.search}</output>;
};

const render = (ui: ReactElement, initialEntry = "/analytics") =>
	testingLibraryRender(
		<MemoryRouter initialEntries={[initialEntry]}>
			{ui}
			<LocationProbe />
		</MemoryRouter>,
	);

let onLineDescriptor: PropertyDescriptor | undefined;
let visibilityStateDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
	onLineDescriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");
	visibilityStateDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
	Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
	vi.mocked(getAnalyticsSeries).mockReset();
	vi.mocked(getAnalyticsSeries).mockResolvedValue([]);
	vi.mocked(getAnalyticsStatus).mockReset();
	vi.mocked(getAnalyticsStatus).mockResolvedValue({ rxSec: 0, totalSec: 0, txSec: 0 });
	vi.mocked(getAnalyticsSummary).mockReset();
	vi.mocked(getAnalyticsSummary).mockResolvedValue({});
	vi.mocked(getDbStats).mockReset();
	vi.mocked(getDbStats).mockResolvedValue({
		connections: { max: 1, open: 1, used: 1 },
		engine: "sqlite",
		io: { reads: 0, writes: 0 },
		size: 0,
	});
});

afterEach(async () => {
	cleanup();
	if (onLineDescriptor) {
		Object.defineProperty(navigator, "onLine", onLineDescriptor);
	} else {
		Reflect.deleteProperty(navigator, "onLine");
	}
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
	it("restores and shares the selected host and range in the URL", async () => {
		const { default: Analytics } = await import("./index");

		render(<Analytics />, "/analytics?host=1&range=7d");

		await waitFor(() => expect(getAnalyticsSummary).toHaveBeenCalledWith(1, "7d"));
		fireEvent.click(screen.getByRole("button", { name: "30d" }));
		await waitFor(() => expect(screen.getByTestId("analytics-location")).toHaveTextContent("?host=1&range=30d"));
	});

	it("downloads the selected traffic series as a CSV", async () => {
		const createObjectURL = vi.fn((_blob: Blob) => "blob:analytics-export");
		const revokeObjectURL = vi.fn();
		const TestURL = class extends URL {};
		Object.assign(TestURL, { createObjectURL, revokeObjectURL });
		vi.stubGlobal("URL", TestURL);
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
		vi.mocked(getAnalyticsSeries).mockResolvedValue([
			{ bytes: 2048, count: 42, s2xx: 37, s3xx: 2, s4xx: 2, s5xx: 1, timestamp: "2026-07-13T12:00:00Z" },
		]);
		const { default: Analytics } = await import("./index");

		render(<Analytics />);

		await waitFor(() => expect(getAnalyticsSeries).toHaveBeenCalledWith(1, "24h"));
		fireEvent.click(screen.getByRole("button", { name: "Download" }));

		expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
		expect(createObjectURL.mock.calls[0][0].type).toBe("text/csv;charset=utf-8");
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:analytics-export");
	});

	it("loads live and database stats through the shared API client", async () => {
		vi.mocked(getDbStats).mockResolvedValue({
			connections: { max: 10, open: 2, used: 2 },
			engine: "sqlite",
			io: { reads: 3, writes: 4 },
			size: 2048,
		});
		vi.mocked(getAnalyticsStatus).mockResolvedValue({ rxSec: 1024, totalSec: 3072, txSec: 2048 });
		const { default: Analytics } = await import("./index");

		render(<Analytics />);

		await screen.findByText("2 KB");
		await screen.findByText("3 KB/s");
		expect(getDbStats).toHaveBeenCalledTimes(1);
		expect(getAnalyticsStatus).toHaveBeenCalledTimes(1);
	});

	it("defers chart rendering until its section is near the viewport", async () => {
		const observers: Array<{ callback: IntersectionObserverCallback; observe: ReturnType<typeof vi.fn> }> = [];
		class IntersectionObserverMock {
			callback: IntersectionObserverCallback;
			observe = vi.fn();

			constructor(callback: IntersectionObserverCallback) {
				this.callback = callback;
				observers.push(this);
			}

			disconnect = vi.fn();
			unobserve = vi.fn();
		}
		vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
		vi.mocked(getAnalyticsSeries).mockResolvedValue([
			{ bytes: 0, count: 1, s2xx: 1, s3xx: 0, s4xx: 0, s5xx: 0, timestamp: "2026-01-01T12:00:00Z" },
		]);
		const { default: Analytics } = await import("./index");

		render(<Analytics />);

		await waitFor(() => expect(getAnalyticsSeries).toHaveBeenCalledOnce());
		expect(observers.length).toBeGreaterThanOrEqual(2);
		expect(screen.queryByTestId("analytics-area-chart")).not.toBeInTheDocument();

		await act(async () => {
			for (const observer of observers) {
				observer.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
			}
		});

		expect(await screen.findByTestId("analytics-area-chart")).toBeInTheDocument();
		expect(screen.getByTestId("analytics-bar-chart")).toBeInTheDocument();
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

	it("backs off failed summary refreshes before retrying", async () => {
		vi.useFakeTimers();
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		vi.mocked(getAnalyticsSummary)
			.mockRejectedValueOnce(new Error("temporarily unavailable"))
			.mockResolvedValueOnce({ count: 1 });
		const { default: Analytics } = await import("./index");

		render(<Analytics />);
		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(getAnalyticsSummary).toHaveBeenCalledOnce();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(10_000);
		});
		expect(getAnalyticsSummary).toHaveBeenCalledOnce();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(10_000);
		});
		expect(getAnalyticsSummary).toHaveBeenCalledTimes(2);
		consoleErrorSpy.mockRestore();
	});

	it("backs off failed live-status refreshes before retrying", async () => {
		vi.useFakeTimers();
		vi.mocked(getAnalyticsStatus)
			.mockRejectedValueOnce(new Error("temporarily unavailable"))
			.mockResolvedValueOnce({ rxSec: 1024, totalSec: 2048, txSec: 1024 });
		const { default: Analytics } = await import("./index");

		render(<Analytics />);
		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(getAnalyticsStatus).toHaveBeenCalledOnce();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(2_000);
		});
		expect(getAnalyticsStatus).toHaveBeenCalledOnce();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(2_000);
		});
		expect(getAnalyticsStatus).toHaveBeenCalledTimes(2);
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
		expect(getAnalyticsStatus).not.toHaveBeenCalled();
	});

	it("pauses analytics polling offline and refreshes after reconnecting", async () => {
		vi.useFakeTimers();
		Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
		const { default: Analytics } = await import("./index");

		render(<Analytics />);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(10_000);
		});

		expect(getAnalyticsSummary).not.toHaveBeenCalled();
		expect(getAnalyticsSeries).not.toHaveBeenCalled();
		expect(getDbStats).not.toHaveBeenCalled();
		expect(getAnalyticsStatus).not.toHaveBeenCalled();

		Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
		await act(async () => {
			window.dispatchEvent(new Event("online"));
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(getAnalyticsSummary).toHaveBeenCalledOnce();
		expect(getAnalyticsSeries).toHaveBeenCalledOnce();
		expect(getDbStats).toHaveBeenCalledOnce();
		expect(getAnalyticsStatus).toHaveBeenCalledOnce();
	});

	it("refreshes live analytics after reconnecting while an offline request is still pending", async () => {
		let resolveFirstLiveStatus: ((value: Awaited<ReturnType<typeof getAnalyticsStatus>>) => void) | undefined;
		const firstLiveStatus = new Promise<Awaited<ReturnType<typeof getAnalyticsStatus>>>((resolve) => {
			resolveFirstLiveStatus = resolve;
		});
		vi.mocked(getAnalyticsStatus)
			.mockReturnValueOnce(firstLiveStatus)
			.mockResolvedValueOnce({ rxSec: 1024, totalSec: 2048, txSec: 1024 });
		const { default: Analytics } = await import("./index");

		render(<Analytics />);
		await waitFor(() => expect(getAnalyticsStatus).toHaveBeenCalledOnce());

		Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
		window.dispatchEvent(new Event("offline"));
		Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
		window.dispatchEvent(new Event("online"));

		expect(getAnalyticsStatus).toHaveBeenCalledTimes(2);
		if (!resolveFirstLiveStatus) {
			throw new Error("Deferred live-status resolver is unavailable");
		}
	});

	it("keeps live status polling while a database statistics refresh is pending", async () => {
		vi.useFakeTimers();
		let resolveDbStats: ((value: Awaited<ReturnType<typeof getDbStats>>) => void) | undefined;
		let resolveLiveStatus: ((value: Awaited<ReturnType<typeof getAnalyticsStatus>>) => void) | undefined;
		const pendingDbStats = new Promise<Awaited<ReturnType<typeof getDbStats>>>((resolve) => {
			resolveDbStats = resolve;
		});
		const pendingLiveStatus = new Promise<Awaited<ReturnType<typeof getAnalyticsStatus>>>((resolve) => {
			resolveLiveStatus = resolve;
		});
		vi.mocked(getDbStats).mockReturnValue(pendingDbStats);
		vi.mocked(getAnalyticsStatus).mockReturnValue(pendingLiveStatus);
		const { default: Analytics } = await import("./index");

		render(<Analytics />);
		expect(getAnalyticsStatus).toHaveBeenCalledOnce();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(6000);
		});

		expect(getAnalyticsStatus).toHaveBeenCalledOnce();

		if (!resolveLiveStatus) {
			throw new Error("Deferred live-status resolver is unavailable");
		}
		const resolveStatus = resolveLiveStatus;
		await act(async () => {
			resolveStatus({ rxSec: 512, totalSec: 1024, txSec: 512 });
			await pendingLiveStatus;
			await Promise.resolve();
		});
		expect(getDbStats).toHaveBeenCalledOnce();
		await act(async () => {
			await vi.advanceTimersByTimeAsync(6000);
		});
		expect(getAnalyticsStatus).toHaveBeenCalledTimes(4);
		expect(getDbStats).toHaveBeenCalledOnce();

		if (!resolveDbStats) {
			throw new Error("Deferred database statistics resolver is unavailable");
		}
		const resolveStats = resolveDbStats;
		await act(async () => {
			resolveStats({
				connections: { max: 1, open: 1, used: 1 },
				engine: "sqlite",
				io: { reads: 0, writes: 0 },
				size: 0,
			});
			await pendingDbStats;
			await Promise.resolve();
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(2000);
		});

		expect(getAnalyticsStatus).toHaveBeenCalledTimes(5);
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
		expect(getAnalyticsStatus).toHaveBeenCalledTimes(1);
	});

	it("resumes recurring live-status polling after the document becomes visible", async () => {
		vi.useFakeTimers();
		Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
		const { default: Analytics } = await import("./index");

		render(<Analytics />);
		Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"));
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(getAnalyticsStatus).toHaveBeenCalledOnce();
		expect(getDbStats).toHaveBeenCalledOnce();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(2_000);
		});

		expect(getAnalyticsStatus).toHaveBeenCalledTimes(2);
		expect(getDbStats).toHaveBeenCalledOnce();
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
		let resolveFirstLiveStatus: ((value: Awaited<ReturnType<typeof getAnalyticsStatus>>) => void) | undefined;
		const firstLiveStatus = new Promise<Awaited<ReturnType<typeof getAnalyticsStatus>>>((resolve) => {
			resolveFirstLiveStatus = resolve;
		});
		vi.mocked(getAnalyticsStatus)
			.mockReturnValueOnce(firstLiveStatus)
			.mockResolvedValueOnce({ rxSec: 2048, totalSec: 4096, txSec: 2048 });
		const { default: Analytics } = await import("./index");

		render(<Analytics />);
		await waitFor(() => expect(getAnalyticsStatus).toHaveBeenCalledTimes(1));

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
			resolveLiveStatus({ rxSec: 512, totalSec: 1024, txSec: 512 });
			await firstLiveStatus;
			await Promise.resolve();
		});

		expect(screen.queryByText("1 KB/s")).not.toBeInTheDocument();
	});
});
