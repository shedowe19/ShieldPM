import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	deadHostModalModuleError: undefined as Error | undefined,
	deadHostModalModuleLoaded: vi.fn(),
	deleteConfirmModalModuleLoaded: vi.fn(),
	helpModalModuleLoaded: vi.fn(),
	showDeadHostModal: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
	showError: vi.fn(),
	showHelpModal: vi.fn(),
}));

vi.mock("src/modals/DeadHostModal", () => {
	mocks.deadHostModalModuleLoaded();
	if (mocks.deadHostModalModuleError) {
		throw mocks.deadHostModalModuleError;
	}
	return { showDeadHostModal: mocks.showDeadHostModal };
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

describe("Dead Hosts modal loaders", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		mocks.deadHostModalModuleError = undefined;
	});

	it("shows an error when the deferred Dead Host modal cannot load", async () => {
		mocks.deadHostModalModuleError = new Error("Dead Host modal chunk is unavailable");
		const { showDeadHostModal } = await import("./lazy");

		await showDeadHostModal(73);

		expect(mocks.showError).toHaveBeenCalledWith(expect.any(String));
		expect(mocks.showDeadHostModal).not.toHaveBeenCalled();
	});

	it("loads each Dead Hosts modal only when its action is requested", async () => {
		const { showDeadHostModal, showDeleteConfirmModal, showHelpModal } = await import("./lazy");
		const props = { children: "Delete dead host", onConfirm: vi.fn() };

		expect(mocks.deadHostModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.deleteConfirmModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.helpModalModuleLoaded).not.toHaveBeenCalled();

		await showDeadHostModal(73);

		expect(mocks.showDeadHostModal).toHaveBeenCalledWith(73);
		expect(mocks.deleteConfirmModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.helpModalModuleLoaded).not.toHaveBeenCalled();

		await showDeleteConfirmModal(props);
		await showHelpModal("DeadHosts", "red");

		expect(mocks.showDeleteConfirmModal).toHaveBeenCalledWith(props);
		expect(mocks.showHelpModal).toHaveBeenCalledWith("DeadHosts", "red");
	});
});
