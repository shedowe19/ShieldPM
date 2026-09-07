import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	complete2faDuoAuth: vi.fn(),
	completeLogin: vi.fn(),
}));

vi.mock("src/api/backend", () => ({
	complete2faDuoAuth: mocks.complete2faDuoAuth,
}));
vi.mock("src/context", () => ({
	useAuthState: () => ({ completeLogin: mocks.completeLogin }),
}));

import DuoCallback from "./index";

function CurrentLocation() {
	const location = useLocation();
	return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderCallback(query = "?duo_code=duo-code&state=returned-state") {
	return render(
		<StrictMode>
			<MemoryRouter initialEntries={[`/duo-callback${query}`]}>
				<CurrentLocation />
				<Routes>
					<Route path="/duo-callback" element={<DuoCallback />} />
					<Route path="/" element={<p>Signed in</p>} />
				</Routes>
			</MemoryRouter>
		</StrictMode>,
	);
}

describe("DuoCallback", () => {
	const storageAccess = vi.fn(() => {
		throw new Error("Browser storage is unavailable");
	});

	beforeEach(() => {
		vi.clearAllMocks();
		for (const storage of ["sessionStorage", "localStorage"]) {
			vi.stubGlobal(storage, {
				getItem: storageAccess,
				setItem: storageAccess,
				removeItem: storageAccess,
				clear: storageAccess,
			});
		}
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		expect(storageAccess).not.toHaveBeenCalled();
	});

	it("completes login with only the returned code and state, once under StrictMode", async () => {
		const response = { expires: Date.now() + 60 * 60 * 1000, user: { id: 1 } };
		mocks.complete2faDuoAuth.mockResolvedValue(response);

		renderCallback();

		await waitFor(() => expect(screen.getByText("Signed in")).toBeInTheDocument());
		expect(mocks.complete2faDuoAuth).toHaveBeenCalledExactlyOnceWith("duo-code", "returned-state");
		expect(mocks.completeLogin).toHaveBeenCalledExactlyOnceWith(response);
		expect(screen.getByTestId("location").textContent).toBe("/");
	});

	it("removes callback credentials from the URL while retaining the in-flight login response", async () => {
		let finishLogin: ((response: object) => void) | undefined;
		mocks.complete2faDuoAuth.mockReturnValue(
			new Promise((resolve) => {
				finishLogin = resolve;
			}),
		);
		renderCallback();

		expect(screen.getByTestId("location").textContent).toBe("/duo-callback");
		expect(screen.getByText("Completing Duo authentication…")).toBeInTheDocument();
		expect(mocks.complete2faDuoAuth).toHaveBeenCalledExactlyOnceWith("duo-code", "returned-state");
		expect(mocks.completeLogin).not.toHaveBeenCalled();

		const response = { expires: "2026-09-07T12:15:00Z" };
		finishLogin?.(response);

		await waitFor(() => expect(screen.getByText("Signed in")).toBeInTheDocument());
		expect(mocks.completeLogin).toHaveBeenCalledExactlyOnceWith(response);
	});

	it.each(["", "?state=returned-state", "?duo_code=&state=returned-state"])(
		"rejects a missing code before requesting authentication (%s)",
		(query) => {
			renderCallback(query);

			expect(
				screen.getByText("Missing Duo authorization code or session token. Please try signing in again."),
			).toBeInTheDocument();
			expect(mocks.complete2faDuoAuth).not.toHaveBeenCalled();
			expect(mocks.completeLogin).not.toHaveBeenCalled();
			expect(screen.getByTestId("location").textContent).toBe("/duo-callback");
		},
	);

	it.each(["?duo_code=duo-code", "?duo_code=duo-code&state="])(
		"rejects missing callback state before requesting authentication (%s)",
		(query) => {
			renderCallback(query);

			expect(screen.getByText("Duo authentication failed. Please try again.")).toBeInTheDocument();
			expect(mocks.complete2faDuoAuth).not.toHaveBeenCalled();
			expect(mocks.completeLogin).not.toHaveBeenCalled();
			expect(screen.getByTestId("location").textContent).toBe("/duo-callback");
		},
	);

	it.each([
		[new Error("Duo session expired"), "Duo session expired"],
		[new Error(""), "Duo authentication failed. Please try again."],
		[null, "Duo authentication failed. Please try again."],
	])("shows a failed verification without establishing a session (%s)", async (error, message) => {
		mocks.complete2faDuoAuth.mockRejectedValue(error);
		renderCallback();

		await waitFor(() => expect(screen.getByText(message as string)).toBeInTheDocument());
		expect(mocks.complete2faDuoAuth).toHaveBeenCalledExactlyOnceWith("duo-code", "returned-state");
		expect(mocks.completeLogin).not.toHaveBeenCalled();
		expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveAttribute("href", "/login");
		expect(screen.getByTestId("location").textContent).toBe("/duo-callback");
	});
});
