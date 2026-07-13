import { cleanup, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopHostsWidget } from "./TopHostsWidget";

const mocks = vi.hoisted(() => ({
	useAnalyticsTopHosts: vi.fn(),
}));

vi.mock("@tabler/icons-react", () => ({ IconChartBar: () => null }));
vi.mock("react-intl", () => ({ FormattedNumber: ({ value }: { value: number }) => <>{value}</> }));
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
		return id;
	},
}));

describe("TopHostsWidget", () => {
	beforeEach(() => {
		mocks.useAnalyticsTopHosts.mockReturnValue({
			data: [
				{ domainName: "api.example", id: 7, requests: 42 },
				{ domainName: "app.example", id: 3, requests: 8 },
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
});
