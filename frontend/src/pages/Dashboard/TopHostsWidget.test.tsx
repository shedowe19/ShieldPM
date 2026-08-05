import { cleanup, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopHostsWidget } from "./TopHostsWidget";

const mocks = vi.hoisted(() => ({
	useAnalyticsTopHosts: vi.fn(),
}));

vi.mock("@tabler/icons-react", () => ({
	IconAlertTriangle: () => null,
	IconChartBar: () => null,
	IconClock: () => null,
}));
vi.mock("react-intl", () => ({
	FormattedNumber: ({ style, unit, value }: { style?: string; unit?: string; value: number }) => (
		<output data-style={style} data-testid={`formatted-number-${value}`} data-unit={unit}>
			{value}
		</output>
	),
}));
vi.mock("src/components/HasPermission", () => ({
	HasPermission: ({ children }: PropsWithChildren) => <>{children}</>,
}));
vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: PropsWithChildren) => <section>{children}</section>,
	CardContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	CardHeader: ({ children }: PropsWithChildren) => <header>{children}</header>,
	CardTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));
vi.mock("src/hooks/useAnalyticsTopHosts", () => ({ useAnalyticsTopHosts: mocks.useAnalyticsTopHosts }));
vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => {
		if (id === "analytics.no-data-list") return "No data to display";
		if (id === "dashboard.top-hosts") return "Top Proxy Hosts";
		if (id === "dashboard.top-bandwidth") return "Top Bandwidth Consumers";
		if (id === "dashboard.top-client-errors") return "Top Client Errors";
		if (id === "dashboard.top-server-errors") return "Top Server Errors";
		if (id === "dashboard.top-response-time") return "Slowest Proxy Hosts";
		return id;
	},
}));

describe("TopHostsWidget", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.useAnalyticsTopHosts.mockReturnValue({
			data: [
				{ bytes: 1536, clientErrors: 4, domainName: "api.example", id: 7, requests: 42, serverErrors: 2 },
				{ bytes: 1024, clientErrors: 12, domainName: "app.example", id: 3, requests: 8, serverErrors: 1 },
			],
			isLoading: false,
		});
	});

	afterEach(cleanup);

	it("shows ranked proxy hosts and links each host to its 24-hour analytics investigation", () => {
		render(
			<MemoryRouter>
				<TopHostsWidget />
			</MemoryRouter>,
		);

		expect(screen.getByRole("heading", { name: "Top Proxy Hosts" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "api.example" })).toHaveAttribute(
			"href",
			"/analytics?host=7&range=24h",
		);
		expect(screen.getByRole("link", { name: "app.example" })).toHaveAttribute(
			"href",
			"/analytics?host=3&range=24h",
		);
		expect(screen.getByText("42")).toBeInTheDocument();
		expect(screen.getByText("8")).toBeInTheDocument();
	});

	it("shows the bandwidth ranking with byte units so administrators can investigate traffic-heavy proxy hosts", () => {
		render(
			<MemoryRouter>
				<TopHostsWidget sort="bytes" />
			</MemoryRouter>,
		);

		expect(mocks.useAnalyticsTopHosts).toHaveBeenCalledWith("bytes");
		expect(screen.getByRole("heading", { name: "Top Bandwidth Consumers" })).toBeInTheDocument();
		expect(screen.getByTestId("formatted-number-1.536")).toHaveAttribute("data-unit", "kilobyte");
		expect(screen.getByTestId("formatted-number-1.024")).toHaveAttribute("data-unit", "kilobyte");
	});

	it("shows the server-error ranking so administrators can investigate failing proxy hosts", () => {
		render(
			<MemoryRouter>
				<TopHostsWidget sort="server_errors" />
			</MemoryRouter>,
		);

		expect(mocks.useAnalyticsTopHosts).toHaveBeenCalledWith("server_errors");
		expect(screen.getByRole("heading", { name: "Top Server Errors" })).toBeInTheDocument();
		expect(screen.getByText("2")).toBeInTheDocument();
		expect(screen.getByText("1")).toBeInTheDocument();
	});

	it("shows the client-error ranking so administrators can investigate failed client requests", () => {
		render(
			<MemoryRouter>
				<TopHostsWidget sort="client_errors" />
			</MemoryRouter>,
		);

		expect(mocks.useAnalyticsTopHosts).toHaveBeenCalledWith("client_errors");
		expect(screen.getByRole("heading", { name: "Top Client Errors" })).toBeInTheDocument();
		expect(screen.getByText("12")).toBeInTheDocument();
		expect(screen.getByText("4")).toBeInTheDocument();
	});

	it("shows the slowest proxy hosts with average response times so administrators can investigate latency", () => {
		mocks.useAnalyticsTopHosts.mockReturnValue({
			data: [
				{
					averageDuration: 1825,
					bytes: 1536,
					clientErrors: 4,
					domainName: "api.example",
					id: 7,
					requests: 42,
					serverErrors: 2,
				},
			],
			isLoading: false,
		});

		render(
			<MemoryRouter>
				<TopHostsWidget sort="response_time" />
			</MemoryRouter>,
		);

		expect(mocks.useAnalyticsTopHosts).toHaveBeenCalledWith("response_time");
		expect(screen.getByRole("heading", { name: "Slowest Proxy Hosts" })).toBeInTheDocument();
		expect(screen.getByTestId("formatted-number-1825")).toHaveAttribute("data-unit", "millisecond");
	});
});
