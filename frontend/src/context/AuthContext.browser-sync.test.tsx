import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import AuthStore from "src/modules/AuthStore";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useIntervalWhen: vi.fn() }));
vi.mock("rooks", () => ({ useIntervalWhen: mocks.useIntervalWhen }));
vi.mock("src/notifications", () => ({ showError: vi.fn() }));
let restoreStorage: PropertyDescriptor | undefined;
afterEach(() => {
	cleanup();
	if (restoreStorage) Object.defineProperty(window, "localStorage", restoreStorage);
	vi.unstubAllGlobals();
	AuthStore.clear();
});
it("verifies BroadcastChannel identity updates when localStorage is unavailable", async () => {
	let channel!: { onmessage?: (event: { data: string }) => void };
	class Channel {
		onmessage?: (event: { data: string }) => void;
		postMessage = vi.fn();
		constructor() {
			channel = this;
		}
	}
	vi.stubGlobal("BroadcastChannel", Channel);
	restoreStorage = Object.getOwnPropertyDescriptor(window, "localStorage");
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		get: () => {
			throw new DOMException("Denied", "SecurityError");
		},
	});
	let cookieUser = 1;
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async (url: string) =>
				new Response(
					JSON.stringify(
						url === "/api/users/me"
							? { id: cookieUser }
							: { expires: Date.now() + 900_000, user: { id: 1 } },
					),
					{ status: 200 },
				),
		),
	);
	const { AuthProvider, useAuthState } = await import("./AuthContext");
	function Probe() {
		const auth = useAuthState();
		return <output>{auth.loading ? "loading" : auth.authenticated ? "signed in" : "signed out"}</output>;
	}
	const client = new QueryClient();
	render(
		<QueryClientProvider client={client}>
			<AuthProvider>
				<Probe />
			</AuthProvider>
		</QueryClientProvider>,
	);
	await screen.findByText("signed in");
	client.setQueryData(["private"], "old administrator data");
	cookieUser = 2;
	await act(async () =>
		channel.onmessage?.({
			data: JSON.stringify({
				revision: "other-tab",
				sequence: 2,
				expires: Date.now() + 900_000,
				userId: 2,
				impersonating: true,
			}),
		}),
	);
	await screen.findByText("signed in");
	expect(AuthStore.userId).toBe(2);
	expect(AuthStore.isImpersonating).toBe(true);
	expect(client.getQueryData(["private"])).toBeUndefined();
	await act(async () =>
		channel.onmessage?.({
			data: JSON.stringify({ revision: "older-logout", sequence: 1, expires: null, impersonating: false }),
		}),
	);
	expect(AuthStore.userId).toBe(2);
	expect(screen.getByText("signed in")).toBeInTheDocument();
	const before = vi.mocked(fetch).mock.calls.length;
	await act(async () => {
		await mocks.useIntervalWhen.mock.lastCall?.[0]();
	});
	expect(fetch).toHaveBeenCalledTimes(before);
	await act(async () =>
		channel.onmessage?.({
			data: JSON.stringify({
				revision: "expired",
				sequence: 3,
				expires: Date.now() - 1,
				userId: 2,
				impersonating: true,
			}),
		}),
	);
	expect(screen.getByText("signed out")).toBeInTheDocument();
	client.clear();
});
