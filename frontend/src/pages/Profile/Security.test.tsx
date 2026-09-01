import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SecuritySettings from "./Security";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGet2fa = vi.fn();
const mockGetSetting = vi.fn();
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
	getSetting: (...args: unknown[]) => mockGetSetting(...args),
	stepUpAuthentication: vi.fn(),
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
		mockGetSetting.mockResolvedValue({ id: "oidc-config", meta: { enabled: true } });
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

	it("offers the recent-session OIDC identity link flow", async () => {
		render(<SecuritySettings />, { wrapper: makeWrapper() });

		const link = await screen.findByRole("link", { name: "Link OpenID Connect" });
		expect(link).toHaveAttribute("href", "/api/oidc?purpose=link");
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
});
