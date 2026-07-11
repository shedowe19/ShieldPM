import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	ddnsProviderModalModuleError: undefined as Error | undefined,
	ddnsProviderModalModuleLoaded: vi.fn(),
	deleteConfirmModalModuleLoaded: vi.fn(),
	helpModalModuleLoaded: vi.fn(),
	showDdnsProviderModal: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
	showError: vi.fn(),
	showHelpModal: vi.fn(),
}));

vi.mock("src/modals/DdnsProviderModal", () => {
	mocks.ddnsProviderModalModuleLoaded();
	if (mocks.ddnsProviderModalModuleError) {
		throw mocks.ddnsProviderModalModuleError;
	}
	return { showDdnsProviderModal: mocks.showDdnsProviderModal };
});

vi.mock("src/modals/DeleteConfirmModal", () => {
	mocks.deleteConfirmModalModuleLoaded();
	return { showDeleteConfirmModal: mocks.showDeleteConfirmModal };
});

vi.mock("src/modals/HelpModal", () => {
	mocks.helpModalModuleLoaded();
	return { showHelpModal: mocks.showHelpModal };
});

vi.mock("src/notifications", () => ({ showError: mocks.showError }));

describe("DDNS Providers modal loaders", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		mocks.ddnsProviderModalModuleError = undefined;
	});

	it("shows an error when the deferred DDNS Provider modal cannot load", async () => {
		mocks.ddnsProviderModalModuleError = new Error("DDNS Provider modal chunk is unavailable");
		const { showDdnsProviderModal } = await import("./lazy");

		await showDdnsProviderModal(73);

		expect(mocks.showError).toHaveBeenCalledWith(expect.any(String));
		expect(mocks.showDdnsProviderModal).not.toHaveBeenCalled();
	});

	it("loads each DDNS Providers modal only when its action is requested", async () => {
		const { showDdnsProviderModal, showDeleteConfirmModal, showHelpModal } = await import("./lazy");
		const props = { children: "Delete DDNS provider", onConfirm: vi.fn() };

		expect(mocks.ddnsProviderModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.deleteConfirmModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.helpModalModuleLoaded).not.toHaveBeenCalled();

		await showDdnsProviderModal(73);

		expect(mocks.showDdnsProviderModal).toHaveBeenCalledWith(73);
		expect(mocks.deleteConfirmModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.helpModalModuleLoaded).not.toHaveBeenCalled();

		await showDeleteConfirmModal(props);
		await showHelpModal("DdnsProviders", "cyan");

		expect(mocks.showDeleteConfirmModal).toHaveBeenCalledWith(props);
		expect(mocks.showHelpModal).toHaveBeenCalledWith("DdnsProviders", "cyan");
	});
});
