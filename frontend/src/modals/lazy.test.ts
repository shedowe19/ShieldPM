import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	accessListModalModuleLoaded: vi.fn(),
	changePasswordModalModuleLoaded: vi.fn(),
	modalModuleError: undefined as Error | undefined,
	modalModuleLoaded: vi.fn(),
	showAccessListModal: vi.fn(),
	showError: vi.fn(),
	showChangePasswordModal: vi.fn(),
	showProxyHostModal: vi.fn(),
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

vi.mock("./ChangePasswordModal", () => {
	mocks.changePasswordModalModuleLoaded();
	return { showChangePasswordModal: mocks.showChangePasswordModal };
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

	it("loads the password modal only when a password change is requested", async () => {
		const { showChangePasswordModal } = await import("./lazy");

		expect(mocks.changePasswordModalModuleLoaded).not.toHaveBeenCalled();

		await showChangePasswordModal("me");

		expect(mocks.changePasswordModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showChangePasswordModal).toHaveBeenCalledWith("me");
	});
});
