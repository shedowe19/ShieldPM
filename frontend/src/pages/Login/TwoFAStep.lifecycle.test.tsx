import { startAuthentication } from "@simplewebauthn/browser";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { begin2faDuoAuth, begin2faPasskeyAuth, complete2faPasskeyAuth, verify2faCode } from "src/api/backend";
import AuthStore from "src/modules/AuthStore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TwoFAStep from "./TwoFAStep";

vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: vi.fn() }));
vi.mock("src/api/backend", () => ({
	verify2faCode: vi.fn(),
	begin2faPasskeyAuth: vi.fn(),
	complete2faPasskeyAuth: vi.fn(),
	begin2faDuoAuth: vi.fn(),
}));
vi.mock("src/modules/AuthStore", () => ({ default: { set: vi.fn() } }));

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

const token = { expires: "2026-09-09T00:00:00Z" };
const challenge = { challengeId: "challenge", options: { challenge: "encoded" } as never };
const assertion = { id: "credential", type: "public-key", response: {} } as never;
const onSuccess = vi.fn();
function openStep(methods = ["totp"]) {
	return render(
		<StrictMode>
			<TwoFAStep pendingToken="pending" methods={methods} onSuccess={onSuccess} />
		</StrictMode>,
	);
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(begin2faPasskeyAuth).mockResolvedValue(challenge);
	vi.mocked(startAuthentication).mockResolvedValue(assertion);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("TwoFAStep lifecycle", () => {
	it("does not replace the current client session when a removed code form completes", async () => {
		const response = deferred<typeof token>();
		vi.mocked(verify2faCode).mockReturnValue(response.promise);
		const view = openStep();
		fireEvent.click(screen.getByRole("button", { name: "Authenticator App" }));
		const input = screen.getByLabelText("Authenticator Code");
		fireEvent.change(input, { target: { value: "123456" } });
		fireEvent.click(screen.getByRole("button", { name: "Verify" }));
		expect(verify2faCode).toHaveBeenCalledOnce();
		view.unmount();
		await act(async () => {
			response.resolve(token);
		});
		expect(AuthStore.set).not.toHaveBeenCalled();
		expect(onSuccess).not.toHaveBeenCalled();
	});

	it("does not open the browser passkey prompt after leaving a pending begin request", async () => {
		const response = deferred<typeof challenge>();
		vi.mocked(begin2faPasskeyAuth).mockReturnValue(response.promise);
		const view = openStep(["passkey"]);
		fireEvent.click(screen.getByRole("button", { name: "Passkey" }));
		view.unmount();
		await act(async () => {
			response.resolve(challenge);
		});
		expect(startAuthentication).not.toHaveBeenCalled();
		expect(complete2faPasskeyAuth).not.toHaveBeenCalled();
	});

	it("does not send a cookie-setting completion after leaving the browser passkey prompt", async () => {
		const response = deferred<typeof assertion>();
		vi.mocked(startAuthentication).mockReturnValue(response.promise);
		const view = openStep(["passkey"]);
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Passkey" }));
		});
		expect(startAuthentication).toHaveBeenCalledOnce();
		view.unmount();
		await act(async () => {
			response.resolve(assertion);
		});
		expect(complete2faPasskeyAuth).not.toHaveBeenCalled();
		expect(AuthStore.set).not.toHaveBeenCalled();
	});

	it("does not adopt a passkey completion after leaving the form", async () => {
		const response = deferred<typeof token>();
		vi.mocked(complete2faPasskeyAuth).mockReturnValue(response.promise);
		const view = openStep(["passkey"]);
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Passkey" }));
		});
		expect(complete2faPasskeyAuth).toHaveBeenCalledOnce();
		view.unmount();
		await act(async () => {
			response.resolve(token);
		});
		expect(AuthStore.set).not.toHaveBeenCalled();
		expect(onSuccess).not.toHaveBeenCalled();
	});

	it("does not redirect a new page when a removed Duo form receives its authorization URL", async () => {
		const response = deferred<{ authUrl: string }>();
		vi.mocked(begin2faDuoAuth).mockReturnValue(response.promise);
		vi.stubGlobal("location", { href: "https://shieldpm.example/login" });
		const view = openStep(["duo"]);
		fireEvent.click(screen.getByRole("button", { name: "Duo Security" }));
		view.unmount();
		await act(async () => {
			response.resolve({ authUrl: "https://duo.example/authorize" });
		});
		expect(window.location.href).toBe("https://shieldpm.example/login");
	});
});
