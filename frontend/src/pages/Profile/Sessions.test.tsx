import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SessionsSettings from "./Sessions";

vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => <>{id}</>,
	formatDateTime: (value: string) => value,
}));

const currentFamily = "11111111-1111-4111-8111-111111111111";
const otherFamily = "22222222-2222-4222-8222-222222222222";
const payload = (other = true) => ({
	sessions: [
		{
			family_id: currentFamily,
			current: true,
			user_agent: "This test browser",
			ip: "192.0.2.1",
			created_at: null,
			last_active_at: null,
			expires_at: null,
		},
		...(other
			? [
					{
						family_id: otherFamily,
						current: false,
						user_agent: "Other test browser",
						ip: "192.0.2.2",
						created_at: null,
						last_active_at: null,
						expires_at: null,
					},
				]
			: []),
	],
	has_more: false,
	access_token_ttl_minutes: 15,
});
const response = (body: object, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const mount = () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			<SessionsSettings />
		</QueryClientProvider>,
	);
};
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("browser session management", () => {
	it("uses the real hook and API to display families and revoke a selected device after confirmation", async () => {
		let hasOther = true;
		let resolve!: (value: Response) => void;
		const pending = {
			promise: new Promise<Response>((fulfill) => {
				resolve = fulfill;
			}),
		};
		const fetcher = vi.fn(async (url: string, options: RequestInit) => {
			expect(options.credentials).toBe("include");
			if (options.method === "DELETE") {
				expect(url).toBe(`/api/tokens/sessions/${otherFamily}`);
				return pending.promise;
			}
			expect(url).toBe("/api/tokens/sessions");
			return response(payload(hasOther));
		});
		vi.stubGlobal("fetch", fetcher);
		mount();
		await screen.findByText("sessions.current");
		expect(screen.getByText("This test browser")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "sessions.revoke" }));
		expect(fetcher.mock.calls.filter(([, options]) => options.method === "DELETE")).toHaveLength(0);
		fireEvent.click(screen.getByRole("button", { name: "confirm" }));
		await waitFor(() => expect(screen.getByRole("button", { name: "confirm" })).toBeDisabled());
		fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		hasOther = false;
		resolve(response({ revoked: true }));
		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
		expect(screen.queryByText("Other test browser")).not.toBeInTheDocument();
		expect(screen.getByText("This test browser")).toBeInTheDocument();
	});

	it("reports revocation errors without removing devices or dismissing confirmation", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, options: RequestInit) =>
				options.method === "DELETE"
					? response({ error: { message: "Revocation failed" } }, 500)
					: response(payload()),
			),
		);
		mount();
		await screen.findByText("Other test browser");
		fireEvent.click(screen.getByRole("button", { name: "sessions.revoke-others" }));
		fireEvent.click(screen.getByRole("button", { name: "confirm" }));
		await screen.findByText("Revocation failed");
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		expect(screen.getByText("Other test browser")).toBeInTheDocument();
	});

	it("aborts an unfinished session read when leaving the panel", async () => {
		let signal: AbortSignal | null | undefined;
		vi.stubGlobal(
			"fetch",
			vi.fn((_url: string, options: RequestInit) => {
				signal = options.signal;
				return new Promise<Response>((_resolve, reject) =>
					signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))),
				);
			}),
		);
		const view = mount();
		await waitFor(() => expect(signal).toBeDefined());
		view.unmount();
		expect(signal?.aborted).toBe(true);
	});
});
