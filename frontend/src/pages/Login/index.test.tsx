import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	claimOidcToken: vi.fn(),
	getSetting: vi.fn(),
	completeLogin: vi.fn(),
	login: vi.fn(),
	authStoreAdd: vi.fn(),
	authStoreSet: vi.fn(),
	authStoreSetCsrfToken: vi.fn(),
	twoFaResponse: { expires: Date.now() + 60 * 60 * 1000 },
}));

vi.mock("src/api/backend", () => ({
	claimOidcToken: mocks.claimOidcToken,
	getSetting: mocks.getSetting,
}));

vi.mock("src/components/LocalePicker", () => ({ LocalePicker: () => <div>locale picker</div> }));
vi.mock("src/components/ThemeSwitcher", () => ({ ThemeSwitcher: () => <div>theme switcher</div> }));

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
		set: mocks.authStoreSet,
		setCsrfToken: mocks.authStoreSetCsrfToken,
	},
}));

vi.mock("./TwoFAStep", () => ({
	default: ({ onSuccess }: { onSuccess: (response: typeof mocks.twoFaResponse) => void }) => (
		<button type="button" onClick={() => onSuccess(mocks.twoFaResponse)}>
			Complete two-factor verification
		</button>
	),
}));

import Login from "./index";

describe("Login", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.claimOidcToken.mockRejectedValue(new Error("No pending OIDC login"));
		mocks.getSetting.mockResolvedValue({ meta: { enabled: false } });
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

	it("shows the configured OIDC provider without exposing provider secrets", async () => {
		mocks.getSetting.mockResolvedValue({ meta: { enabled: true, name: "Example SSO" } });

		render(<Login />);

		const link = await screen.findByRole("link", { name: "login.oidc" });
		expect(link).toHaveAttribute("href", "/api/oidc");
	});

	it("uses localized descriptions for password and two-factor login", async () => {
		mocks.login.mockRejectedValue({
			methods: ["totp"],
			pendingToken: "pending-token",
			requires2fa: true,
		});

		render(<Login />);

		expect(screen.getByText("login.description")).toBeInTheDocument();

		fireEvent.change(screen.getByLabelText("email-address"), { target: { value: "admin@example.test" } });
		fireEvent.change(screen.getByLabelText("password"), { target: { value: "correct horse battery staple" } });
		fireEvent.click(screen.getByRole("button", { name: "sign-in" }));

		expect(await screen.findByText("login.two-factor.description")).toBeInTheDocument();
	});

	it("uses a localized title for rejected password logins", async () => {
		mocks.login.mockRejectedValue(new Error("Invalid email or password"));

		render(<Login />);

		fireEvent.change(screen.getByLabelText("email-address"), { target: { value: "admin@example.test" } });
		fireEvent.change(screen.getByLabelText("password"), { target: { value: "incorrect password" } });
		fireEvent.click(screen.getByRole("button", { name: "sign-in" }));

		expect(await screen.findByText("error.title")).toBeInTheDocument();
	});

	it("adopts a verified two-factor token through AuthContext without reloading the document", async () => {
		mocks.login.mockRejectedValue({
			csrfToken: "csrf-token",
			methods: ["totp"],
			pendingToken: "pending-token",
			requires2fa: true,
		});

		render(<Login />);

		fireEvent.change(screen.getByLabelText("email-address"), { target: { value: "admin@example.test" } });
		fireEvent.change(screen.getByLabelText("password"), { target: { value: "correct horse battery staple" } });
		fireEvent.click(screen.getByRole("button", { name: "sign-in" }));

		const completeTwoFactorVerification = await screen.findByRole("button", {
			name: "Complete two-factor verification",
		});
		fireEvent.click(completeTwoFactorVerification);

		expect(mocks.completeLogin).toHaveBeenCalledWith(mocks.twoFaResponse);
		expect(mocks.authStoreSet).not.toHaveBeenCalled();
	});
});
