import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	complete2faDuoAuth: vi.fn(),
	completeLogin: vi.fn(),
	navigate: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => ({
	...(await importOriginal<typeof import("react-router-dom")>()),
	useNavigate: () => mocks.navigate,
}));

vi.mock("src/api/backend", () => ({
	complete2faDuoAuth: mocks.complete2faDuoAuth,
}));
vi.mock("src/context", () => ({
	useAuthState: () => ({ completeLogin: mocks.completeLogin }),
}));
vi.mock("src/modules/AuthStore", () => ({ default: { set: vi.fn() } }));

import DuoCallback from "./index";

describe("DuoCallback", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
	});

	afterEach(() => {
		cleanup();
	});

	it("accepts a completed Duo token through the auth context and navigates without a document reload", async () => {
		const response = { expires: Date.now() + 60 * 60 * 1000, user: { id: 1 } };
		mocks.complete2faDuoAuth.mockResolvedValue(response);
		sessionStorage.setItem("duo_pending_token", "pending-token");
		sessionStorage.setItem("duo_expected_state", "duo-state");

		render(
			<MemoryRouter initialEntries={["/duo-callback?duo_code=duo-code&state=duo-state"]}>
				<DuoCallback />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(mocks.complete2faDuoAuth).toHaveBeenCalledWith("pending-token", "duo-code", "duo-state");
			expect(mocks.completeLogin).toHaveBeenCalledWith(response);
			expect(mocks.navigate).toHaveBeenCalledWith("/", { replace: true });
			expect(sessionStorage.getItem("duo_pending_token")).toBeNull();
			expect(sessionStorage.getItem("duo_expected_state")).toBeNull();
		});
	});

	it("rejects a callback whose state does not match the initiating browser flow", async () => {
		sessionStorage.setItem("duo_pending_token", "pending-token");
		sessionStorage.setItem("duo_expected_state", "expected-state");

		render(
			<MemoryRouter initialEntries={["/duo-callback?duo_code=duo-code&state=attacker-state"]}>
				<DuoCallback />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(mocks.complete2faDuoAuth).not.toHaveBeenCalled();
			expect(mocks.completeLogin).not.toHaveBeenCalled();
			expect(sessionStorage.getItem("duo_pending_token")).toBeNull();
			expect(sessionStorage.getItem("duo_expected_state")).toBeNull();
		});
	});
});
