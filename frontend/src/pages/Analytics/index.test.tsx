import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getAnalyticsSeries, getAnalyticsSummary } from "src/api/backend";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/api/backend", () => ({
	getAnalyticsSeries: vi.fn().mockResolvedValue([]),
	getAnalyticsSummary: vi.fn().mockResolvedValue({}),
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

beforeEach(() => {
	vi.mocked(getAnalyticsSeries).mockReset();
	vi.mocked(getAnalyticsSeries).mockResolvedValue([]);
	vi.mocked(getAnalyticsSummary).mockReset();
	vi.mocked(getAnalyticsSummary).mockResolvedValue({});
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
	vi.unstubAllGlobals();
	await changeLocale("en-US");
});

describe("Analytics", () => {
	it("renders the host selector placeholder in the active locale", async () => {
		await changeLocale("de-DE");
		const { default: Analytics } = await import("./index");

		render(<Analytics />);

		expect(await screen.findByTestId("host-select-placeholder")).toHaveTextContent("Host auswählen");
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
});
