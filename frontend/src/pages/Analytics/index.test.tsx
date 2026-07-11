import { cleanup, render, screen } from "@testing-library/react";
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
});
