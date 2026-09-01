import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TwoFAStep from "./TwoFAStep";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@simplewebauthn/browser", () => ({
	startAuthentication: vi.fn(() => Promise.resolve({ id: "cred_id", type: "public-key", response: {} })),
}));

vi.mock("src/api/backend", () => ({
	verify2faCode: vi.fn(),
	begin2faPasskeyAuth: vi.fn(),
	complete2faPasskeyAuth: vi.fn(),
	begin2faDuoAuth: vi.fn(),
	complete2faDuoAuth: vi.fn(),
}));

vi.mock("src/modules/AuthStore", () => ({
	default: { set: vi.fn(), setCsrfToken: vi.fn() },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const { verify2faCode, begin2faPasskeyAuth, complete2faPasskeyAuth, begin2faDuoAuth } = await import("src/api/backend");
const AuthStore = (await import("src/modules/AuthStore")).default;

const mockOnSuccess = vi.fn();

const renderStep = (methods = ["totp"]) =>
	render(<TwoFAStep pendingToken="mock_pending_token" methods={methods} onSuccess={mockOnSuccess} />);

// ── Tests ──────────────────────────────────────────────────────────────────

describe("TwoFAStep", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
	});

	afterEach(() => {
		cleanup();
	});

	it("renders the 2FA heading", () => {
		renderStep(["totp"]);
		expect(screen.getByText("Two-Factor Verification")).toBeInTheDocument();
	});

	it("shows Authenticator App button when totp method is available", () => {
		renderStep(["totp"]);
		expect(screen.getByText("Authenticator App")).toBeInTheDocument();
	});

	it("shows YubiKey button when yubikey method is available", () => {
		renderStep(["yubikey"]);
		expect(screen.getByText("YubiKey")).toBeInTheDocument();
	});

	it("shows Passkey button when passkey method is available", () => {
		renderStep(["passkey"]);
		expect(screen.getByText("Passkey")).toBeInTheDocument();
	});

	it("shows Duo Security button when duo method is available", () => {
		renderStep(["duo"]);
		expect(screen.getByText("Duo Security")).toBeInTheDocument();
	});

	it("always shows backup code fallback link", () => {
		renderStep(["totp"]);
		expect(screen.getByText(/backup code/i)).toBeInTheDocument();
	});

	it("shows TOTP code input after clicking Authenticator App", async () => {
		renderStep(["totp"]);
		fireEvent.click(screen.getByText("Authenticator App"));
		await waitFor(() => {
			expect(screen.getByLabelText("Authenticator Code")).toBeInTheDocument();
		});
	});

	it("shows backup code input after clicking backup code link", async () => {
		renderStep(["totp"]);
		fireEvent.click(screen.getByText(/backup code instead/i));
		await waitFor(() => {
			expect(screen.getByLabelText("Backup Code")).toBeInTheDocument();
		});
	});

	it("calls verify2faCode and onSuccess on valid TOTP submission", async () => {
		const mockResponse = { expires: "2026-03-19T00:00:00Z", user: { id: 1 } };
		vi.mocked(verify2faCode).mockResolvedValue(mockResponse as never);

		renderStep(["totp"]);
		fireEvent.click(screen.getByText("Authenticator App"));

		await waitFor(() => screen.getByLabelText("Authenticator Code"));
		const codeInput = screen.getByLabelText("Authenticator Code");
		fireEvent.change(codeInput, { target: { value: "123456" } });
		fireEvent.submit(codeInput.closest("form") as HTMLFormElement);

		await waitFor(() => {
			expect(verify2faCode).toHaveBeenCalledWith({
				pendingToken: "mock_pending_token",
				method: "totp",
				code: "123456",
			});
			expect(AuthStore.set).toHaveBeenCalledWith(mockResponse);
			expect(mockOnSuccess).toHaveBeenCalledWith(mockResponse);
		});
	});

	it("shows an error message when verify2faCode rejects", async () => {
		vi.mocked(verify2faCode).mockRejectedValue(new Error("Invalid TOTP code"));

		renderStep(["totp"]);
		fireEvent.click(screen.getByText("Authenticator App"));

		await waitFor(() => screen.getByLabelText("Authenticator Code"));
		fireEvent.change(screen.getByLabelText("Authenticator Code"), { target: { value: "000000" } });
		fireEvent.submit(screen.getByLabelText("Authenticator Code").closest("form") as HTMLFormElement);

		await waitFor(() => {
			expect(screen.getByText("Invalid TOTP code")).toBeInTheDocument();
		});
	});

	it("calls begin2faPasskeyAuth and complete2faPasskeyAuth for passkey auth", async () => {
		vi.mocked(begin2faPasskeyAuth).mockResolvedValue({
			options: { challenge: "abc" } as never,
			challengeId: "cid_1",
		});
		vi.mocked(complete2faPasskeyAuth).mockResolvedValue({
			expires: "2026-03-19T00:00:00Z",
		} as never);

		renderStep(["passkey"]);
		fireEvent.click(screen.getByText("Passkey"));

		await waitFor(() => {
			expect(begin2faPasskeyAuth).toHaveBeenCalledWith("mock_pending_token");
			expect(complete2faPasskeyAuth).toHaveBeenCalled();
		});
	});

	it("redirects for Duo auth when Duo button is clicked", async () => {
		vi.mocked(begin2faDuoAuth).mockResolvedValue({
			authUrl: "https://duo.example.com/authorize?state=abc",
			state: "abc",
		});

		const originalLocation = window.location;
		Object.defineProperty(window, "location", {
			writable: true,
			value: { href: "" },
		});

		renderStep(["duo"]);
		fireEvent.click(screen.getByText("Duo Security"));

		await waitFor(() => {
			expect(begin2faDuoAuth).toHaveBeenCalledWith("mock_pending_token");
			expect(sessionStorage.getItem("duo_pending_token")).toBe("mock_pending_token");
			expect(sessionStorage.getItem("duo_expected_state")).toBe("abc");
			expect(window.location.href).toBe("https://duo.example.com/authorize?state=abc");
		});

		Object.defineProperty(window, "location", { value: originalLocation });
	});

	it("renders multiple methods simultaneously", () => {
		renderStep(["totp", "yubikey", "passkey"]);
		expect(screen.getByText("Authenticator App")).toBeInTheDocument();
		expect(screen.getByText("YubiKey")).toBeInTheDocument();
		expect(screen.getByText("Passkey")).toBeInTheDocument();
	});
});
