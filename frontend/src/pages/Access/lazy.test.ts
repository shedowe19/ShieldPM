import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	accessListModalError: undefined as Error | undefined,
	accessListModalModuleLoaded: vi.fn(),
	deleteConfirmModalModuleLoaded: vi.fn(),
	helpModalModuleLoaded: vi.fn(),
	showAccessListModal: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
	showError: vi.fn(),
	showHelpModal: vi.fn(),
}));

vi.mock("src/modals/AccessListModal", () => {
	mocks.accessListModalModuleLoaded();
	if (mocks.accessListModalError) {
		throw mocks.accessListModalError;
	}
	return { showAccessListModal: mocks.showAccessListModal };
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

describe("access modal wrappers", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		mocks.accessListModalError = undefined;
	});

	it("notifies when the Access List dialog cannot load", async () => {
		mocks.accessListModalError = new Error("Access List dialog chunk is unavailable");
		const { showAccessListModal } = await import("./lazy");

		await showAccessListModal(73);

		expect(mocks.showError).toHaveBeenCalledWith(expect.any(String));
		expect(mocks.showAccessListModal).not.toHaveBeenCalled();
	});

	it("loads each Access dialog only for its matching table action", async () => {
		const { showAccessListModal, showDeleteConfirmModal, showHelpModal } = await import("./lazy");

		expect(mocks.accessListModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.deleteConfirmModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.helpModalModuleLoaded).not.toHaveBeenCalled();

		await showAccessListModal("new");
		const deleteProps = { children: "Delete access list", onConfirm: vi.fn() };
		await showDeleteConfirmModal(deleteProps);
		await showHelpModal("AccessLists", "cyan");

		expect(mocks.accessListModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.deleteConfirmModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.helpModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showAccessListModal).toHaveBeenCalledWith("new");
		expect(mocks.showDeleteConfirmModal).toHaveBeenCalledWith(deleteProps);
		expect(mocks.showHelpModal).toHaveBeenCalledWith("AccessLists", "cyan");
	});
});
