import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FirewallPolicies from "./FirewallPolicies";

const mocks = vi.hoisted(() => ({
	deleteFirewallPolicy: vi.fn(),
	toast: vi.fn(),
	useFirewallPolicies: vi.fn(),
}));

vi.mock("src/api/backend", () => ({
	createFirewallPolicy: vi.fn(),
	deleteFirewallPolicy: mocks.deleteFirewallPolicy,
	refreshFirewallPolicy: vi.fn(),
	updateFirewallPolicy: vi.fn(),
}));

vi.mock("src/components/HasPermission", () => ({
	HasPermission: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("src/hooks", () => ({
	useFirewallPolicies: mocks.useFirewallPolicies,
}));

vi.mock("src/hooks/use-toast", () => ({
	useToast: () => ({ toast: mocks.toast }),
}));

const policy = {
	action: "deny" as const,
	allowCidrs: [],
	blockCidrs: [],
	enabled: true,
	feedUrls: [],
	geoCountries: [],
	geoMode: "off" as const,
	id: 7,
	lastError: null,
	lastUpdatedOn: null,
	name: "Public deny list",
	refreshIntervalHours: 24,
	totalCidrs: 0,
};

const renderPage = () => {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
	render(
		<QueryClientProvider client={queryClient}>
			<FirewallPolicies />
		</QueryClientProvider>,
	);
	return { invalidateQueries, queryClient };
};

describe("FirewallPolicies deletion", () => {
	beforeEach(async () => {
		await changeLocale("en-US");
		vi.stubGlobal(
			"confirm",
			vi.fn(() => true),
		);
		mocks.deleteFirewallPolicy.mockRejectedValue(new Error("Nginx synchronization failed"));
		mocks.useFirewallPolicies.mockReturnValue({ data: [policy], error: null, isLoading: false });
	});

	afterEach(async () => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
		await changeLocale("en-US");
	});

	it("reports a failed deletion and invalidates the policy list", async () => {
		const { invalidateQueries, queryClient } = renderPage();

		fireEvent.click(screen.getByRole("button", { name: "Delete" }));

		await waitFor(() => {
			expect(mocks.deleteFirewallPolicy).toHaveBeenCalledWith(7);
			expect(mocks.toast).toHaveBeenCalledWith(
				expect.objectContaining({ description: "Nginx synchronization failed", variant: "destructive" }),
			);
			expect(screen.getByText("Nginx synchronization failed")).toBeInTheDocument();
			expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["firewall-policies"] });
		});

		queryClient.clear();
	});
});
