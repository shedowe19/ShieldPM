import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	deleteConfirmModalModuleLoaded: vi.fn(),
	helpModalModuleLoaded: vi.fn(),
	modalModuleError: undefined as Error | undefined,
	redirectionHostModalModuleLoaded: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
	showError: vi.fn(),
	showHelpModal: vi.fn(),
	showRedirectionHostModal: vi.fn(),
}));

vi.mock("src/modals/DeleteConfirmModal", () => {
	mocks.deleteConfirmModalModuleLoaded();
	return { showDeleteConfirmModal: mocks.showDeleteConfirmModal };
});

vi.mock("src/modals/HelpModal", () => {
	mocks.helpModalModuleLoaded();
	return { showHelpModal: mocks.showHelpModal };
});

vi.mock("src/modals/RedirectionHostModal", () => {
	mocks.redirectionHostModalModuleLoaded();
	if (mocks.modalModuleError) {
		throw mocks.modalModuleError;
	}
	return { showRedirectionHostModal: mocks.showRedirectionHostModal };
});

vi.mock("src/notifications", () => ({ showError: mocks.showError }));

describe("Redirection Hosts modal loaders", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		mocks.modalModuleError = undefined;
	});

	it("shows an error when the deferred Redirection Host modal cannot load", async () => {
		mocks.modalModuleError = new Error("Redirection Host modal chunk is unavailable");
		const { showRedirectionHostModal } = await import("./lazy");

		await showRedirectionHostModal(73);

		expect(mocks.showError).toHaveBeenCalledWith(expect.any(String));
		expect(mocks.showRedirectionHostModal).not.toHaveBeenCalled();
	});

	it("loads each Redirection Hosts modal only when its action is requested", async () => {
		const { showDeleteConfirmModal, showHelpModal, showRedirectionHostModal } = await import("./lazy");
		const props = { children: "Delete redirection host", onConfirm: vi.fn() };

		expect(mocks.deleteConfirmModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.helpModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.redirectionHostModalModuleLoaded).not.toHaveBeenCalled();

		await showRedirectionHostModal(73);

		expect(mocks.showRedirectionHostModal).toHaveBeenCalledWith(73);
		expect(mocks.deleteConfirmModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.helpModalModuleLoaded).not.toHaveBeenCalled();

		await showDeleteConfirmModal(props);
		await showHelpModal("RedirectionHosts", "yellow");

		expect(mocks.showDeleteConfirmModal).toHaveBeenCalledWith(props);
		expect(mocks.showHelpModal).toHaveBeenCalledWith("RedirectionHosts", "yellow");
	});
});
