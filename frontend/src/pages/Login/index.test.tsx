import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	claimOidcToken: vi.fn(),
	completeLogin: vi.fn(),
	login: vi.fn(),
	authStoreAdd: vi.fn(),
	authStoreSet: vi.fn(),
	authStoreSetCsrfToken: vi.fn(),
	twoFaResponse: { expires: Date.now() + 60 * 60 * 1000 },
}));

vi.mock("src/api/backend", () => ({ claimOidcToken: mocks.claimOidcToken }));

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

	it("does not adopt an OIDC response after leaving the login page", async () => {
		let resolveClaim!: (response: { expires: number }) => void;
		mocks.claimOidcToken.mockReturnValue(
			new Promise((resolve) => {
				resolveClaim = resolve;
			}),
		);
		const { unmount } = render(<Login />);
		unmount();
		await act(async () => {
			resolveClaim({ expires: Date.now() + 60_000 });
		});
		expect(mocks.completeLogin).not.toHaveBeenCalled();
	});

	it("claims and adopts an OIDC login only once in StrictMode", async () => {
		const token = { expires: Date.now() + 60_000 };
		mocks.claimOidcToken.mockResolvedValue(token);
		render(
			<StrictMode>
				<Login />
			</StrictMode>,
		);
		await waitFor(() => expect(mocks.completeLogin).toHaveBeenCalledWith(token));
		expect(mocks.claimOidcToken).toHaveBeenCalledTimes(1);
		expect(mocks.completeLogin).toHaveBeenCalledTimes(1);
	});

	it("does not send a queued password login after the page has unmounted", async () => {
		let resolveClaim!: (response: { expires: number }) => void;
		mocks.claimOidcToken.mockReturnValue(
			new Promise((resolve) => {
				resolveClaim = resolve;
			}),
		);
		mocks.login.mockResolvedValue(undefined);
		const { unmount } = render(<Login />);
		fireEvent.change(screen.getByLabelText("email-address"), { target: { value: "admin@example.test" } });
		fireEvent.change(screen.getByLabelText("password"), { target: { value: "valid password" } });
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "sign-in" }));
		});
		unmount();
		await act(async () => {
			resolveClaim({ expires: Date.now() + 60_000 });
		});
		expect(mocks.login).not.toHaveBeenCalled();
		expect(mocks.completeLogin).not.toHaveBeenCalled();
	});

	it.each(["success", "failure"])(
		"waits for a pending OIDC claim (%s) before sending an explicit password login",
		async (outcome) => {
			let resolveClaim!: (response: { expires: number }) => void;
			let rejectClaim!: (error: Error) => void;
			mocks.claimOidcToken.mockReturnValue(
				new Promise((resolve, reject) => {
					resolveClaim = resolve;
					rejectClaim = reject;
				}),
			);
			mocks.login.mockResolvedValue(undefined);
			render(<Login />);
			fireEvent.change(screen.getByLabelText("email-address"), { target: { value: "admin@example.test" } });
			fireEvent.change(screen.getByLabelText("password"), { target: { value: "valid password" } });
			await act(async () => {
				fireEvent.click(screen.getByRole("button", { name: "sign-in" }));
			});
			expect(mocks.login).not.toHaveBeenCalled();
			await act(async () => {
				if (outcome === "success") resolveClaim({ expires: Date.now() + 60_000 });
				else rejectClaim(new Error("No pending OIDC login"));
			});
			expect(mocks.login).toHaveBeenCalledTimes(1);
			expect(mocks.login).toHaveBeenCalledWith("admin@example.test", "valid password");
			expect(mocks.completeLogin).not.toHaveBeenCalled();
		},
	);

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
