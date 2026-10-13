import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TableWrapper from "./TableWrapper";

vi.mock("src/hooks", async () => import("src/hooks/useProxyHosts"));
vi.mock("src/components", () => ({
	HasPermission: ({ children }: PropsWithChildren) => children,
	LoadingPage: () => <span>Loading</span>,
}));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));
vi.mock("./lazy", () => ({
	showAccessListModal: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
	showHelpModal: vi.fn(),
	showProxyHostModal: vi.fn(),
}));
vi.mock("./Table", () => ({ default: () => <span>Hosts</span> }));

let client: QueryClient;
const requests: { query: string; signal: AbortSignal | undefined }[] = [];
beforeEach(() => {
	vi.useFakeTimers();
	requests.length = 0;
	client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
	vi.stubGlobal(
		"fetch",
		vi.fn((url: string, options: RequestInit) => {
			const query = new URL(url, "https://shieldpm.example").searchParams.get("query") ?? "";
			const signal = options.signal ?? undefined;
			requests.push({ query, signal });
			if (query) {
				return new Promise<Response>((_resolve, reject) => {
					signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
						once: true,
					});
				});
			}
			return Promise.resolve(
				new Response(
					JSON.stringify({
						items: [{ id: 1, domain_names: ["host.example"] }],
						pagination: { limit: 100, page: 1, total_items: 1, total_pages: 1 },
					}),
				),
			);
		}),
	);
});
afterEach(() => {
	cleanup();
	client.clear();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});
const advance = async (milliseconds: number) => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(milliseconds);
	});
};
async function mount() {
	render(
		<QueryClientProvider client={client}>
			<TableWrapper />
		</QueryClientProvider>,
	);
	await advance(1);
	return screen.getByRole("searchbox");
}

it("updates the focused input immediately but sends one request after a typing burst", async () => {
	const input = await mount();
	input.focus();
	for (const value of ["My", "My H", "My Host "]) fireEvent.change(input, { target: { value } });
	expect(input).toHaveValue("My Host ");
	expect(input).toHaveFocus();
	expect(requests.map(({ query }) => query)).toEqual([""]);
	await advance(299);
	expect(requests).toHaveLength(1);
	await advance(1);
	expect(requests.map(({ query }) => query)).toEqual(["", "my host"]);
	expect(screen.getByRole("searchbox")).toBe(input);
	expect(input).toHaveFocus();
});

it("aborts an obsolete fetch through the actual hook and API client", async () => {
	const input = await mount();
	fireEvent.change(input, { target: { value: "first" } });
	await advance(300);
	const first = requests[1];
	expect(first.query).toBe("first");
	expect(first.signal?.aborted).toBe(false);
	fireEvent.change(input, { target: { value: "second" } });
	await advance(300);
	expect(first.signal?.aborted).toBe(true);
	expect(requests.map(({ query }) => query)).toEqual(["", "first", "second"]);
	cleanup();
	expect(requests[2].signal?.aborted).toBe(true);
});
