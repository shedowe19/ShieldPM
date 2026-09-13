import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getToken: vi.fn(),
	loginAsUser: vi.fn(),
	refreshToken: vi.fn(),
	restoreSession: vi.fn(),
	useIntervalWhen: vi.fn(),
}));
vi.mock("rooks", () => ({ useIntervalWhen: mocks.useIntervalWhen }));
vi.mock("src/api/backend", () => ({
	getToken: mocks.getToken,
	loginAsUser: mocks.loginAsUser,
	refreshToken: mocks.refreshToken,
	restoreSession: mocks.restoreSession,
}));

import { restoreSession } from "src/api/backend/restoreSession";
import { queryClient } from "src/api/queryClient";
import AuthStore from "src/modules/AuthStore";
import { type AuthContextType, AuthProvider, useAuthState } from "./AuthContext";

const administrator = { expires: Date.now() + 900_000, user: { id: 1 } };
const previousUser = { expires: Date.now() + 900_000, user: { id: 2 } };
const newerUser = { expires: Date.now() + 900_000, user: { id: 3 } };
let auth: AuthContextType;

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
function Probe() {
	auth = useAuthState();
	return <output>{auth.loading ? "loading" : auth.authenticated ? "signed in" : "signed out"}</output>;
}
async function mountProvider() {
	const view = render(
		<QueryClientProvider client={queryClient}>
			<AuthProvider>
				<Probe />
			</AuthProvider>
		</QueryClientProvider>,
	);
	await screen.findByText("signed in");
	return view;
}

beforeEach(() => {
	vi.resetAllMocks();
	AuthStore.clear();
	queryClient.clear();
	window.history.replaceState({}, "", "/");
	mocks.refreshToken.mockResolvedValue(administrator);
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response(null, { status: 204 })),
	);
});
afterEach(() => {
	cleanup();
	AuthStore.clear();
	queryClient.clear();
	vi.unstubAllGlobals();
});

const actions = ["password login", "impersonation", "restoration"] as const;
for (const replacedBy of ["newer login", "provider unmount"] as const) {
	it.each(actions)(`ignores a delayed %s after ${replacedBy}`, async (action) => {
		const view = await mountProvider();
		const delayed = deferred<typeof previousUser>();
		mocks.getToken.mockReturnValue(delayed.promise);
		mocks.loginAsUser.mockReturnValue(delayed.promise);
		mocks.restoreSession.mockReturnValue(delayed.promise);
		const operation =
			action === "password login"
				? auth.login("old@example.test", "password")
				: action === "impersonation"
					? auth.loginAs(2)
					: auth.logout();

		act(() => {
			if (replacedBy === "newer login") auth.completeLogin(newerUser);
			else {
				view.unmount();
				AuthStore.set(newerUser);
			}
		});
		queryClient.setQueryData(["profile"], newerUser.user);
		await act(async () => {
			delayed.resolve(previousUser);
			await operation;
		});

		expect(AuthStore.userId).toBe(3);
		expect(AuthStore.isImpersonating).toBe(false);
		expect(queryClient.getQueryData(["profile"])).toEqual(newerUser.user);
	});
}

it("does not clear a newer login or send its cookies to logout after an old restore fails", async () => {
	await mountProvider();
	const delayed = deferred<typeof administrator>();
	mocks.restoreSession.mockReturnValueOnce(delayed.promise);
	const operation = auth.logout();
	act(() => auth.completeLogin(newerUser));
	queryClient.setQueryData(["profile"], newerUser.user);
	await act(async () => {
		delayed.reject(new Error("No backup session"));
		await operation;
	});
	expect(AuthStore.userId).toBe(3);
	expect(screen.getByText("signed in")).toBeInTheDocument();
	expect(queryClient.getQueryData(["profile"])).toEqual(newerUser.user);
	expect(fetch).not.toHaveBeenCalled();
});

it("ignores a periodic refresh after its provider unmounts", async () => {
	const view = await mountProvider();
	const delayed = deferred<typeof administrator>();
	mocks.refreshToken.mockReturnValueOnce(delayed.promise);
	const operation = mocks.useIntervalWhen.mock.lastCall?.[0]();
	view.unmount();
	AuthStore.set(newerUser);
	await act(async () => {
		delayed.resolve(administrator);
		await operation;
	});
	expect(AuthStore.userId).toBe(3);
});

it("still clears all authentication cookies when the backup administrator token has expired", async () => {
	await mountProvider();
	mocks.restoreSession.mockImplementationOnce(restoreSession);
	vi.mocked(fetch).mockResolvedValueOnce(
		new Response(JSON.stringify({ error: { code: 401, message: "Expired" } }), { status: 401 }),
	);
	await act(async () => {
		await auth.logout();
	});
	expect(AuthStore.active).toBe(false);
	expect(screen.getByText("signed out")).toBeInTheDocument();
	expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(["/api/tokens/restore", "/api/tokens/logout"]);
});
