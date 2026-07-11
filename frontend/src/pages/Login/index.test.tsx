import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	claimOidcToken: vi.fn(),
	completeLogin: vi.fn(),
	login: vi.fn(),
	authStoreAdd: vi.fn(),
	authStoreSetCsrfToken: vi.fn(),
}));

vi.mock("src/api/backend", () => ({ claimOidcToken: mocks.claimOidcToken }));

vi.mock("src/components", () => ({
	LocalePicker: () => <div>locale picker</div>,
	ThemeSwitcher: () => <div>theme switcher</div>,
}));

vi.mock("src/context", () => ({
	useAuthState: () => ({ completeLogin: mocks.completeLogin, login: mocks.login }),
}));

vi.mock("src/hooks", () => ({
	useHealth: () => ({ data: { version: "4.3.2" } }),
}));

vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => <span>{id}</span>,
}));

vi.mock("src/modules/AuthStore", () => ({
	default: {
		add: mocks.authStoreAdd,
		setCsrfToken: mocks.authStoreSetCsrfToken,
	},
}));

vi.mock("./TwoFAStep", () => ({ default: () => <div>two-factor step</div> }));

import Login from "./index";

describe("Login", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it("adopts a claimed OIDC token through AuthContext instead of forcing a page reload", async () => {
		const token = { expires: Date.now() + 60 * 60 * 1000 };
		mocks.claimOidcToken.mockResolvedValue(token);

		render(<Login />);

		await waitFor(() => expect(mocks.completeLogin).toHaveBeenCalledWith(token));
		expect(mocks.authStoreAdd).not.toHaveBeenCalled();
	});
});
