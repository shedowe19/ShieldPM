import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ChatOps from "./ChatOps";

vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const integration = { id: 7, enabled: false, provider: "telegram", config: { allowed_ids: [12345, "67890"] } };
let client: QueryClient;
beforeEach(() => {
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
	cleanup();
	client.clear();
	vi.unstubAllGlobals();
});
function open() {
	render(
		<QueryClientProvider client={client}>
			<MemoryRouter>
				<ChatOps />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

it("round-trips the server allowlist and keeps the stored token when saving an existing integration", async () => {
	vi.stubGlobal(
		"fetch",
		vi
			.fn()
			.mockImplementation((_url, options) =>
				Promise.resolve(new Response(JSON.stringify(options.method === "GET" ? [integration] : integration))),
			),
	);
	open();
	expect(await screen.findByLabelText("chatops.telegram.allowed_ids")).toHaveValue("12345, 67890");
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() =>
		expect(vi.mocked(fetch).mock.calls.some(([, options]) => options?.method === "PUT")).toBe(true),
	);
	const options = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "PUT")?.[1];
	expect(JSON.parse(String(options?.body))).toEqual({
		provider: "telegram",
		enabled: false,
		config: { allowed_ids: ["12345", "67890"] },
	});
});

it("does not offer to create an integration when loading the existing ones fails", async () => {
	vi.stubGlobal(
		"fetch",
		vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify({ error: { message: "Integrations unavailable" } }), { status: 503 }),
			),
	);
	open();
	expect(await screen.findByText("Integrations unavailable")).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
});
