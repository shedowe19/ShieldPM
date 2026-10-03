import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { showFirewallListModal } from "./FirewallListModal";

const mocks = vi.hoisted(() => ({ show: vi.fn(), remove: vi.fn() }));
vi.mock("ez-modal-react", () => ({ default: { create: <T,>(component: T) => component, show: mocks.show } }));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));
vi.mock("src/notifications", () => ({ showSuccess: vi.fn() }));

const list = {
	id: 7,
	name: "Saved list",
	reason: "Saved reason",
	description: "Private note",
	source_type: "manual",
	source_url: "",
	update_interval_hours: 24,
	enabled: false,
	entries: "203.0.113.10",
	entry_count: 1,
};
let client: QueryClient;
function open(id?: number, preset?: "vpn" | "datacenter") {
	showFirewallListModal(id, preset);
	const [Modal, props] = mocks.show.mock.calls[0];
	render(
		<QueryClientProvider client={client}>
			<Modal {...props} visible remove={mocks.remove} />
		</QueryClientProvider>,
	);
}
function fillManual() {
	fireEvent.change(screen.getByLabelText("column.name"), { target: { value: "My blocklist" } });
	fireEvent.change(screen.getByLabelText("firewall.reason"), { target: { value: "Restricted by website policy" } });
	fireEvent.change(screen.getByLabelText("firewall.entries"), { target: { value: "203.0.113.10\n203.0.113.10" } });
}
beforeEach(() => {
	vi.clearAllMocks();
	client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation((url: string, options: RequestInit) =>
			Promise.resolve(
				new Response(
					JSON.stringify(
						url.endsWith("/preview")
							? {
									entries: ["203.0.113.10"],
									duplicates: 1,
									invalid: [],
									total_lines: 2,
								}
							: options.method === "GET"
								? list
								: { ...list, id: 8 },
					),
				),
			),
		),
	);
});
afterEach(() => {
	cleanup();
	client.clear();
	vi.unstubAllGlobals();
});

it("requires validation and submits the normalized entries without duplicate lines", async () => {
	open();
	fillManual();
	expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "firewall.import.preview" }));
	await waitFor(() => expect(screen.getByRole("button", { name: "save" })).toBeEnabled());
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(mocks.remove).toHaveBeenCalled());
	const request = vi.mocked(fetch).mock.calls.find(([url]) => String(url) === "/api/nginx/firewall-lists");
	expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
		entries: "203.0.113.10",
		source_type: "manual",
		enabled: true,
	});
});

it("invalidates a successful preview when the user changes the text", async () => {
	open();
	fillManual();
	fireEvent.click(screen.getByRole("button", { name: "firewall.import.preview" }));
	await waitFor(() => expect(screen.getByRole("button", { name: "save" })).toBeEnabled());
	fireEvent.change(screen.getByLabelText("firewall.entries"), { target: { value: "invalid address" } });
	expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
	expect(screen.getByText("firewall.import.required")).toBeInTheDocument();
});

it("shows a bounded invalid-line preview and prevents saving invalid text", async () => {
	vi.mocked(fetch).mockResolvedValue(
		new Response(
			JSON.stringify({
				entries: ["203.0.113.10"],
				duplicates: 0,
				invalid: Array.from({ length: 15 }, (_, index) => ({ line: index + 1, value: "invalid" })),
				total_lines: 16,
			}),
		),
	);
	open();
	fillManual();
	fireEvent.click(screen.getByRole("button", { name: "firewall.import.preview" }));
	expect(await screen.findByText("firewall.import.correctErrors")).toBeInTheDocument();
	expect(screen.getAllByRole("listitem")).toHaveLength(10);
	expect(screen.getByText("firewall.import.moreErrors")).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
});

it("initializes the selected URL preset and saves without sending its cached entries", async () => {
	open(undefined, "datacenter");
	expect(screen.getByLabelText("firewall.sourceUrl")).toHaveValue(
		"https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/datacenter/ipv4.txt",
	);
	expect(screen.getByLabelText("firewall.reason")).toHaveValue("firewall.preset.datacenter.reason");
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(mocks.remove).toHaveBeenCalled());
	const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
	expect(body).toMatchObject({ source_type: "url", update_interval_hours: 24 });
	expect(body).not.toHaveProperty("entries");
});

it("preserves unsaved fields across cache refreshes and the disabled state when editing", async () => {
	open(7);
	const name = await screen.findByLabelText("column.name");
	fireEvent.change(name, { target: { value: "Unsaved list" } });
	act(() => client.setQueryData(["firewall-list", 7], { ...list, sourceType: "manual", name: "Refreshed list" }));
	expect(name).toHaveValue("Unsaved list");
	fireEvent.click(screen.getByRole("button", { name: "firewall.import.preview" }));
	await waitFor(() => expect(screen.getByRole("button", { name: "save" })).toBeEnabled());
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(mocks.remove).toHaveBeenCalled());
	const request = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "PUT");
	expect(request?.[0]).toBe("/api/nginx/firewall-lists/7");
	expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({ name: "Unsaved list", enabled: false });
});

it("does not show an empty edit form when the saved list cannot be loaded", async () => {
	vi.mocked(fetch).mockResolvedValue(
		new Response(JSON.stringify({ error: { message: "List unavailable" } }), { status: 503 }),
	);
	open(7);
	expect(await screen.findByText("List unavailable")).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
});

it("replaces text from a TXT upload and requires a new validation", async () => {
	open();
	fillManual();
	fireEvent.click(screen.getByRole("button", { name: "firewall.import.preview" }));
	await waitFor(() => expect(screen.getByRole("button", { name: "save" })).toBeEnabled());
	const file = new File(["2001:db8::/32"], "ipv6.txt", { type: "text/plain" });
	Object.defineProperty(file, "text", { value: () => Promise.resolve("2001:db8::/32") });
	fireEvent.change(screen.getByLabelText("firewall.import.upload"), { target: { files: [file] } });
	await waitFor(() => expect(screen.getByLabelText("firewall.entries")).toHaveValue("2001:db8::/32"));
	expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
});
