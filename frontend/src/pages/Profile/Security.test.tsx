import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SecuritySettings from "./Security";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGet2fa = vi.fn();
const mockSetup2faTotp = vi.fn();
const mockEnable2faTotp = vi.fn();
const mockAdd2faYubikey = vi.fn();
const mockBeginPasskeyRegistration = vi.fn();
const mockCompletePasskeyRegistration = vi.fn();
const mockSetup2faDuo = vi.fn();
const mockRemove2faMethod = vi.fn();
const mockRegenerate2faBackupCodes = vi.fn();

vi.mock("src/api/backend", () => ({
	get2fa: (...args: unknown[]) => mockGet2fa(...args),
	setup2faTotp: (...args: unknown[]) => mockSetup2faTotp(...args),
	enable2faTotp: (...args: unknown[]) => mockEnable2faTotp(...args),
	add2faYubikey: (...args: unknown[]) => mockAdd2faYubikey(...args),
	beginPasskeyRegistration: (...args: unknown[]) => mockBeginPasskeyRegistration(...args),
	completePasskeyRegistration: (...args: unknown[]) => mockCompletePasskeyRegistration(...args),
	setup2faDuo: (...args: unknown[]) => mockSetup2faDuo(...args),
	remove2faMethod: (...args: unknown[]) => mockRemove2faMethod(...args),
	regenerate2faBackupCodes: (...args: unknown[]) => mockRegenerate2faBackupCodes(...args),
}));

vi.mock("@simplewebauthn/browser", () => ({
	startRegistration: vi.fn(() =>
		Promise.resolve({ id: "cred_123", type: "public-key", response: { transports: ["usb"] } }),
	),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const makeWrapper = () => {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const Wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	return Wrapper;
};

const emptyStatus = { methods: [], backupCodesRemaining: 0 };

// ── Tests ──────────────────────────────────────────────────────────────────

describe("SecuritySettings", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGet2fa.mockResolvedValue(emptyStatus);
	});

	afterEach(() => {
		cleanup();
	});

	it("renders the 2FA heading", async () => {
		render(<SecuritySettings />, { wrapper: makeWrapper() });
		await waitFor(() => {
			expect(screen.getByText("Two-Factor Authentication")).toBeInTheDocument();
		});
	});

	it("shows add method section when no methods are active", async () => {
		render(<SecuritySettings />, { wrapper: makeWrapper() });
		await waitFor(() => {
			expect(screen.getByText("Add a New Method")).toBeInTheDocument();
		});
	});

	it("shows TOTP setup card when Authenticator App is clicked", async () => {
		render(<SecuritySettings />, { wrapper: makeWrapper() });
		await waitFor(() => screen.getByText("Authenticator App"));

		mockSetup2faTotp.mockResolvedValue({
			qrDataUrl: "data:image/png;base64,fakeqr",
			otpauthUrl: "otpauth://totp/test",
		});

		fireEvent.click(screen.getByText("Authenticator App"));

		await waitFor(() => {
			expect(mockSetup2faTotp).toHaveBeenCalledWith("me");
		});
	});

	it("shows YubiKey setup form when YubiKey is clicked", async () => {
		render(<SecuritySettings />, { wrapper: makeWrapper() });
		await waitFor(() => screen.getByText("YubiKey"));

		fireEvent.click(screen.getByText("YubiKey"));

		await waitFor(() => {
			expect(screen.getByText("YubiKey OTP")).toBeInTheDocument();
		});
	});

	it("shows Duo Security setup form when Duo Security is clicked", async () => {
		render(<SecuritySettings />, { wrapper: makeWrapper() });
		await waitFor(() => screen.getByText("Duo Security"));

		fireEvent.click(screen.getByText("Duo Security"));

		await waitFor(() => {
			expect(screen.getByText("Client ID")).toBeInTheDocument();
			expect(screen.getByText("Client Secret")).toBeInTheDocument();
			expect(screen.getByText("API Hostname")).toBeInTheDocument();
			expect(screen.getByText("Redirect URL")).toBeInTheDocument();
			expect(screen.getByPlaceholderText("https://your-application.example/duo-callback")).toBeInTheDocument();
		});
	});

	it("shows active methods when they exist", async () => {
		mockGet2fa.mockResolvedValue({
			methods: [
				{
					id: 1,
					type: "totp",
					label: "Authenticator App",
					isVerified: true,
					createdOn: "2026-03-19T00:00:00Z",
				},
			],
			backupCodesRemaining: 8,
		});

		render(<SecuritySettings />, { wrapper: makeWrapper() });

		await waitFor(() => {
			expect(screen.getByText("Active Methods")).toBeInTheDocument();
			expect(screen.getAllByText("Authenticator App").length).toBeGreaterThanOrEqual(1);
			expect(screen.getByText("8 backup codes remaining")).toBeInTheDocument();
		});
	});

	it("shows passkey setup button when Passkey is clicked", async () => {
		render(<SecuritySettings />, { wrapper: makeWrapper() });
		await waitFor(() => screen.getByText("Passkey"));

		fireEvent.click(screen.getByText("Passkey"));

		await waitFor(() => {
			expect(screen.getByText("Register Passkey")).toBeInTheDocument();
		});
	});

	it("shows regenerate backup codes button when methods exist", async () => {
		mockGet2fa.mockResolvedValue({
			methods: [{ id: 1, type: "totp", label: "App", isVerified: true, createdOn: "" }],
			backupCodesRemaining: 5,
		});

		render(<SecuritySettings />, { wrapper: makeWrapper() });

		await waitFor(() => {
			expect(screen.getByText("Regenerate Backup Codes")).toBeInTheDocument();
		});
	});

	it("calls regenerate2faBackupCodes when button is clicked and shows codes", async () => {
		mockGet2fa.mockResolvedValue({
			methods: [{ id: 1, type: "totp", label: "App", isVerified: true, createdOn: "" }],
			backupCodesRemaining: 5,
		});
		mockRegenerate2faBackupCodes.mockResolvedValue({
			backupCodes: ["CODE1", "CODE2", "CODE3", "CODE4", "CODE5", "CODE6", "CODE7", "CODE8"],
		});

		render(<SecuritySettings />, { wrapper: makeWrapper() });

		await waitFor(() => screen.getByText("Regenerate Backup Codes"));
		fireEvent.click(screen.getByText("Regenerate Backup Codes"));

		await waitFor(() => {
			expect(mockRegenerate2faBackupCodes).toHaveBeenCalledWith("me");
			expect(screen.getByText("CODE1")).toBeInTheDocument();
		});
	});

	it("surfaces an initial status failure without offering an empty setup state", async () => {
		mockGet2fa.mockRejectedValue(new Error("Security status unavailable"));
		render(<SecuritySettings />, { wrapper: makeWrapper() });
		expect(await screen.findByText("Security status unavailable")).toBeInTheDocument();
		expect(screen.queryByText("Add a New Method")).not.toBeInTheDocument();
	});

	it("keeps security actions from submitting an enclosing profile form", async () => {
		const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
		mockGet2fa.mockResolvedValue({
			methods: [{ id: 1, type: "totp", label: "App", isVerified: true }],
			backupCodesRemaining: 5,
		});
		mockRegenerate2faBackupCodes.mockResolvedValue({ backupCodes: ["new-code"] });
		render(
			<form onSubmit={onSubmit}>
				<SecuritySettings />
			</form>,
			{ wrapper: makeWrapper() },
		);
		fireEvent.click(await screen.findByText("Regenerate Backup Codes"));
		expect(await screen.findByText("new-code")).toBeInTheDocument();
		for (const button of screen.getAllByRole("button")) expect(button).toHaveAttribute("type", "button");
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("issues one TOTP setup request under StrictMode and blocks invalid/repeated Enter verification", async () => {
		mockSetup2faTotp.mockResolvedValue({ qrDataUrl: "data:image/png;base64,fake" });
		mockEnable2faTotp.mockReturnValue(new Promise(() => {}));
		render(
			<StrictMode>
				<SecuritySettings />
			</StrictMode>,
			{ wrapper: makeWrapper() },
		);
		fireEvent.click(await screen.findByText("Authenticator App"));
		const input = await screen.findByPlaceholderText("123456");
		expect(mockSetup2faTotp).toHaveBeenCalledTimes(1);
		fireEvent.change(input, { target: { value: "abcdef" } });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(mockEnable2faTotp).not.toHaveBeenCalled();
		fireEvent.change(input, { target: { value: "123456" } });
		fireEvent.keyDown(input, { key: "Enter" });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(mockEnable2faTotp).toHaveBeenCalledTimes(1);
	});

	it("cannot remove a method while backup codes are being regenerated", async () => {
		mockGet2fa.mockResolvedValue({
			methods: [{ id: 1, type: "totp", label: "App", isVerified: true }],
			backupCodesRemaining: 5,
		});
		mockRegenerate2faBackupCodes.mockReturnValue(new Promise(() => {}));
		render(<SecuritySettings />, { wrapper: makeWrapper() });
		fireEvent.click(await screen.findByText("Regenerate Backup Codes"));
		await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled());
		fireEvent.click(screen.getByRole("button", { name: "Delete" }));
		expect(mockRemove2faMethod).not.toHaveBeenCalled();
	});
	it("shows recovery codes returned by the first YubiKey registration", async () => {
		mockAdd2faYubikey.mockResolvedValue({ id: 8, backupCodes: ["yubi-recovery"] });
		render(<SecuritySettings />, { wrapper: makeWrapper() });
		fireEvent.click(await screen.findByText("YubiKey"));
		const input = screen.getAllByRole("textbox")[1];
		fireEvent.change(input, { target: { value: "c".repeat(44) } });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(await screen.findByText("yubi-recovery")).toBeInTheDocument();
	});

	it("shows recovery codes returned by the first Duo registration", async () => {
		mockSetup2faDuo.mockResolvedValue({ id: 9, backupCodes: ["duo-recovery"] });
		render(<SecuritySettings />, { wrapper: makeWrapper() });
		fireEvent.click(await screen.findByText("Duo Security"));
		const inputs = document.querySelectorAll("input");
		const values = ["DI123", "secret", "api-example.duosecurity.com", "https://example.test/duo-callback"];
		inputs.forEach((input, index) => {
			fireEvent.change(input, { target: { value: values[index] } });
		});
		fireEvent.keyDown(inputs[3], { key: "Enter" });
		expect(await screen.findByText("duo-recovery")).toBeInTheDocument();
	});

	it("prevents closing a pending factor activation before recovery codes are returned", async () => {
		mockBeginPasskeyRegistration.mockReturnValue(new Promise(() => {}));
		render(<SecuritySettings />, { wrapper: makeWrapper() });
		fireEvent.click(await screen.findByText("Passkey"));
		fireEvent.click(screen.getByText("Register Passkey"));
		expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
	});
	it("handles Enter in the passkey label without submitting the enclosing profile form", async () => {
		mockBeginPasskeyRegistration.mockReturnValue(new Promise(() => {}));
		const onKeyDown = vi.fn();
		render(
			<form onKeyDown={onKeyDown}>
				<SecuritySettings />
			</form>,
			{ wrapper: makeWrapper() },
		);
		fireEvent.click(await screen.findByText("Passkey"));
		const input = screen.getByRole("textbox");
		expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(false);
		expect(mockBeginPasskeyRegistration).toHaveBeenCalledTimes(1);
		expect(onKeyDown).not.toHaveBeenCalled();
		fireEvent.keyDown(input, { key: "Enter" });
		expect(mockBeginPasskeyRegistration).toHaveBeenCalledTimes(1);
	});
});
