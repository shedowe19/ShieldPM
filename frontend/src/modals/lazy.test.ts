import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	modalModuleError: undefined as Error | undefined,
	modalModuleLoaded: vi.fn(),
	showError: vi.fn(),
	showProxyHostModal: vi.fn(),
}));

vi.mock("./ProxyHostModal", () => {
	mocks.modalModuleLoaded();
	if (mocks.modalModuleError) {
		throw mocks.modalModuleError;
	}
	return { showProxyHostModal: mocks.showProxyHostModal };
});

vi.mock("src/notifications", () => ({ showError: mocks.showError }));

describe("showProxyHostModal", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		mocks.modalModuleError = undefined;
	});

	it("shows an error notification when the deferred modal cannot load", async () => {
		const error = new Error("Proxy Host modal chunk is unavailable");
		mocks.modalModuleError = error;
		const { showProxyHostModal } = await import("./lazy");

		await showProxyHostModal(73);

		expect(mocks.showError).toHaveBeenCalledOnce();
		expect(mocks.showError).toHaveBeenCalledWith(expect.any(String));
		expect(mocks.showProxyHostModal).not.toHaveBeenCalled();
	});

	it("loads the Proxy Host modal only when it is requested", async () => {
		const { showProxyHostModal } = await import("./lazy");

		expect(mocks.modalModuleLoaded).not.toHaveBeenCalled();

		await showProxyHostModal(73);

		expect(mocks.modalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showProxyHostModal).toHaveBeenCalledWith(73);
	});
});
