import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	deleteConfirmModalModuleLoaded: vi.fn(),
	modalModuleError: undefined as Error | undefined,
	permissionsModalModuleLoaded: vi.fn(),
	setPasswordModalModuleLoaded: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
	showError: vi.fn(),
	showPermissionsModal: vi.fn(),
	showSetPasswordModal: vi.fn(),
}));

vi.mock("src/modals/DeleteConfirmModal", () => {
	mocks.deleteConfirmModalModuleLoaded();
	return { showDeleteConfirmModal: mocks.showDeleteConfirmModal };
});

vi.mock("src/modals/PermissionsModal", () => {
	mocks.permissionsModalModuleLoaded();
	if (mocks.modalModuleError) {
		throw mocks.modalModuleError;
	}
	return { showPermissionsModal: mocks.showPermissionsModal };
});

vi.mock("src/modals/SetPasswordModal", () => {
	mocks.setPasswordModalModuleLoaded();
	return { showSetPasswordModal: mocks.showSetPasswordModal };
});

vi.mock("src/notifications", () => ({ showError: mocks.showError }));

describe("Users modal loaders", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		mocks.modalModuleError = undefined;
	});

	it("shows an error when a deferred user management modal cannot load", async () => {
		mocks.modalModuleError = new Error("Permissions modal chunk is unavailable");
		const { showPermissionsModal } = await import("./lazy");

		await showPermissionsModal(73);

		expect(mocks.showError).toHaveBeenCalledWith(expect.any(String));
		expect(mocks.showPermissionsModal).not.toHaveBeenCalled();
	});

	it("loads each user management modal only when its action is requested", async () => {
		const { showDeleteConfirmModal, showPermissionsModal, showSetPasswordModal } = await import("./lazy");
		const props = { children: "Delete user", onConfirm: vi.fn() };

		expect(mocks.deleteConfirmModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.permissionsModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.setPasswordModalModuleLoaded).not.toHaveBeenCalled();

		await showPermissionsModal(73);

		expect(mocks.showPermissionsModal).toHaveBeenCalledWith(73);
		expect(mocks.deleteConfirmModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.setPasswordModalModuleLoaded).not.toHaveBeenCalled();

		await showSetPasswordModal(74);
		await showDeleteConfirmModal(props);

		expect(mocks.showSetPasswordModal).toHaveBeenCalledWith(74);
		expect(mocks.showDeleteConfirmModal).toHaveBeenCalledWith(props);
	});
});
