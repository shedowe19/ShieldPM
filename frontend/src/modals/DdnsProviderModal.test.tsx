import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { showDdnsProviderModal } from "./DdnsProviderModal";

const mocks = vi.hoisted(() => ({ show: vi.fn(), remove: vi.fn() }));
vi.mock("ez-modal-react", () => ({ default: { create: <T,>(component: T) => component, show: mocks.show } }));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));
vi.mock("src/notifications", () => ({ showObjectSuccess: vi.fn() }));

const provider = {
	id: 7,
	name: "Home",
	provider: "cloudflare",
	domains: ["home.example.test"],
	ip_ver: "v4",
	enabled: false,
	config: { token: "test-token", zone_id: "test-zone" },
};
let client: QueryClient;
function open(id?: number) {
	showDdnsProviderModal(id);
	const [Modal, props] = mocks.show.mock.calls[0];
	render(
		<QueryClientProvider client={client}>
			<Modal {...props} visible remove={mocks.remove} />
		</QueryClientProvider>,
	);
}
beforeEach(() => {
	vi.clearAllMocks();
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	vi.stubGlobal(
		"fetch",
		vi
			.fn()
			.mockImplementation((_url, options) =>
				Promise.resolve(new Response(JSON.stringify(options.method === "GET" ? [provider] : provider))),
			),
	);
});
afterEach(() => {
	cleanup();
	client.clear();
	vi.unstubAllGlobals();
});

it("creates a provider with POST using the new-item sentinel", async () => {
	open();
	fireEvent.change(screen.getByLabelText("column.name"), { target: { value: "New provider" } });
	fireEvent.change(screen.getByLabelText("ddns-providers.domains"), { target: { value: "home.example.test" } });
	fireEvent.change(screen.getByLabelText("ddns-providers.cloudfare_token"), { target: { value: "new-token" } });
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(mocks.remove).toHaveBeenCalled());
	const [url, options] = vi.mocked(fetch).mock.calls[0];
	expect(url).toBe("/api/nginx/ddns-providers");
	expect(options?.method).toBe("POST");
	expect(JSON.parse(String(options?.body))).toMatchObject({ name: "New provider", enabled: true });
});

it("round-trips the stored zone and IP version without reenabling a disabled provider", async () => {
	open(7);
	expect(await screen.findByLabelText("ddns-providers.cloudfare_zone_id")).toHaveValue("test-zone");
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(mocks.remove).toHaveBeenCalled());
	const update = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "PUT");
	expect(update?.[0]).toBe("/api/nginx/ddns-providers/7");
	expect(JSON.parse(String(update?.[1]?.body))).toMatchObject({ ip_ver: "v4", config: { zone_id: "test-zone" } });
	expect(JSON.parse(String(update?.[1]?.body))).not.toHaveProperty("enabled");
	expect(JSON.parse(String(update?.[1]?.body))).not.toHaveProperty("id");
});

it("does not offer an empty edit form when the provider cannot be loaded", async () => {
	vi.mocked(fetch).mockResolvedValue(
		new Response(JSON.stringify({ error: { message: "Provider unavailable" } }), { status: 503 }),
	);
	open(7);
	expect(await screen.findByText("Provider unavailable")).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
});
