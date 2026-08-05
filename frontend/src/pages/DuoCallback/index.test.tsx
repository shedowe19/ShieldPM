import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	complete2faDuoAuth: vi.fn(),
	completeLogin: vi.fn(),
	navigate: vi.fn(),
}));

vi.mock("react-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("react-router")>()),
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

		render(
			<MemoryRouter initialEntries={["/duo-callback?duo_code=duo-code"]}>
				<DuoCallback />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(mocks.complete2faDuoAuth).toHaveBeenCalledWith("pending-token", "duo-code");
			expect(mocks.completeLogin).toHaveBeenCalledWith(response);
			expect(mocks.navigate).toHaveBeenCalledWith("/", { replace: true });
		});
	});
});
