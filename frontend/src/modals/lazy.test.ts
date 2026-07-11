import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	accessListModalModuleLoaded: vi.fn(),
	changePasswordModalModuleLoaded: vi.fn(),
	deleteConfirmModalModuleLoaded: vi.fn(),
	modalModuleError: undefined as Error | undefined,
	modalModuleLoaded: vi.fn(),
	permissionsModalModuleLoaded: vi.fn(),
	setPasswordModalModuleLoaded: vi.fn(),
	showAccessListModal: vi.fn(),
	showChangePasswordModal: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
	showError: vi.fn(),
	showPermissionsModal: vi.fn(),
	showProxyHostModal: vi.fn(),
	showSetPasswordModal: vi.fn(),
	showUserModal: vi.fn(),
	userModalModuleLoaded: vi.fn(),
}));

vi.mock("./AccessListModal", () => {
	mocks.accessListModalModuleLoaded();
	return { showAccessListModal: mocks.showAccessListModal };
});

vi.mock("./ProxyHostModal", () => {
	mocks.modalModuleLoaded();
	if (mocks.modalModuleError) {
		throw mocks.modalModuleError;
	}
	return { showProxyHostModal: mocks.showProxyHostModal };
});

vi.mock("./PermissionsModal", () => {
	mocks.permissionsModalModuleLoaded();
	return { showPermissionsModal: mocks.showPermissionsModal };
});

vi.mock("./SetPasswordModal", () => {
	mocks.setPasswordModalModuleLoaded();
	return { showSetPasswordModal: mocks.showSetPasswordModal };
});

vi.mock("./ChangePasswordModal", () => {
	mocks.changePasswordModalModuleLoaded();
	return { showChangePasswordModal: mocks.showChangePasswordModal };
});

vi.mock("./DeleteConfirmModal", () => {
	mocks.deleteConfirmModalModuleLoaded();
	return { showDeleteConfirmModal: mocks.showDeleteConfirmModal };
});

vi.mock("./UserModal", () => {
	mocks.userModalModuleLoaded();
	return { showUserModal: mocks.showUserModal };
});

vi.mock("src/notifications", () => ({ showError: mocks.showError }));

describe("lazy modal wrappers", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		mocks.modalModuleError = undefined;
	});

	it("loads the Access List modal only when access list editing is requested", async () => {
		const { showAccessListModal } = await import("./lazy");

		expect(mocks.accessListModalModuleLoaded).not.toHaveBeenCalled();

		await showAccessListModal("new");

		expect(mocks.accessListModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showAccessListModal).toHaveBeenCalledWith("new");
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

	it("loads the User modal only when profile editing is requested", async () => {
		const { showUserModal } = await import("./lazy");

		expect(mocks.userModalModuleLoaded).not.toHaveBeenCalled();

		await showUserModal("me");

		expect(mocks.userModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showUserModal).toHaveBeenCalledWith("me");
	});

	it("loads the permissions modal only when permission editing is requested", async () => {
		const { showPermissionsModal } = await import("./lazy");

		expect(mocks.permissionsModalModuleLoaded).not.toHaveBeenCalled();

		await showPermissionsModal(73);

		expect(mocks.permissionsModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showPermissionsModal).toHaveBeenCalledWith(73);
	});

	it("loads the password reset modal only when setting a password is requested", async () => {
		const { showSetPasswordModal } = await import("./lazy");

		expect(mocks.setPasswordModalModuleLoaded).not.toHaveBeenCalled();

		await showSetPasswordModal(73);

		expect(mocks.setPasswordModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showSetPasswordModal).toHaveBeenCalledWith(73);
	});

	it("loads the delete confirmation only when deletion is requested", async () => {
		const { showDeleteConfirmModal } = await import("./lazy");
		const props = { children: "Delete user", onConfirm: vi.fn() };

		expect(mocks.deleteConfirmModalModuleLoaded).not.toHaveBeenCalled();

		await showDeleteConfirmModal(props);

		expect(mocks.deleteConfirmModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showDeleteConfirmModal).toHaveBeenCalledWith(props);
	});

	it("loads the password modal only when a password change is requested", async () => {
		const { showChangePasswordModal } = await import("./lazy");

		expect(mocks.changePasswordModalModuleLoaded).not.toHaveBeenCalled();

		await showChangePasswordModal("me");

		expect(mocks.changePasswordModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showChangePasswordModal).toHaveBeenCalledWith("me");
	});
});
