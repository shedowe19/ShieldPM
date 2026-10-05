import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Firewall from "./Firewall";

const mocks = vi.hoisted(() => ({ permission: "view", showSuccess: vi.fn() }));
vi.mock("src/hooks/useUser", () => ({
	useUser: () => ({
		data: { permissions: { accessLists: mocks.permission, proxyHosts: "view" }, roles: [] },
		isLoading: false,
	}),
}));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
	formatDateTime: (value: string) => value,
}));
vi.mock("src/notifications", () => ({ showSuccess: mocks.showSuccess }));
vi.mock("src/components/LoadingPage", () => ({ LoadingPage: () => "Loading" }));

let client: QueryClient;
const list = {
	id: 7,
	name: "VPN networks",
	reason: "Website access rule",
	source_type: "url",
	entry_count: 30000,
	source_url: "https://example.test/vpn.txt",
	update_interval_hours: 24,
	enabled: true,
	last_updated_on: "2026-10-03 10:00:00",
	last_error: null,
};
function open() {
	render(
		<QueryClientProvider client={client}>
			<MemoryRouter>
				<Firewall />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.permission = "view";
	client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify([list])))),
	);
});
afterEach(() => {
	cleanup();
	client.clear();
	vi.unstubAllGlobals();
});

it("does not request firewall data when access-list visibility is denied", () => {
	mocks.permission = "hidden";
	open();
	expect(screen.getByText("no-permission-error")).toBeInTheDocument();
	expect(fetch).not.toHaveBeenCalled();
});

it("offers list summaries and host navigation without mutation actions to read-only users", async () => {
	open();
	expect(await screen.findByText("VPN networks")).toBeInTheDocument();
	expect(screen.getByRole("link", { name: "proxy-hosts" })).toHaveAttribute("href", "/nginx/proxy");
	expect(screen.queryByRole("button", { name: "firewall.add" })).not.toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "firewall.editNamed" })).not.toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "firewall.refresh" })).not.toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "firewall.deleteNamed" })).not.toBeInTheDocument();
});

it("shows a failed manual refresh while keeping the saved list summary", async () => {
	mocks.permission = "manage";
	vi.mocked(fetch).mockImplementation((url) =>
		Promise.resolve(
			String(url).endsWith("/refresh")
				? new Response(JSON.stringify({ error: { message: "Source download failed" } }), { status: 502 })
				: new Response(JSON.stringify([list])),
		),
	);
	open();
	fireEvent.click(await screen.findByRole("button", { name: "firewall.refresh" }));
	expect(await screen.findByText("Source download failed")).toBeInTheDocument();
	expect(screen.getByText("VPN networks")).toBeInTheDocument();
	expect(mocks.showSuccess).not.toHaveBeenCalled();
});
