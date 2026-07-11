import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	changePasswordModalModuleLoaded: vi.fn(),
	showChangePasswordModal: vi.fn(),
	showUserModal: vi.fn(),
	userModalModuleLoaded: vi.fn(),
}));

vi.mock("./ChangePasswordModal", () => {
	mocks.changePasswordModalModuleLoaded();
	return { showChangePasswordModal: mocks.showChangePasswordModal };
});

vi.mock("./UserModal", () => {
	mocks.userModalModuleLoaded();
	return { showUserModal: mocks.showUserModal };
});

vi.mock("src/notifications", () => ({ showError: vi.fn() }));

describe("account modal wrappers", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it("loads profile and password modals only for their requested account actions", async () => {
		const { showChangePasswordModal, showUserModal } = await import("./account-lazy");

		expect(mocks.changePasswordModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.userModalModuleLoaded).not.toHaveBeenCalled();

		await showUserModal("me");

		expect(mocks.userModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showUserModal).toHaveBeenCalledWith("me");
		expect(mocks.changePasswordModalModuleLoaded).not.toHaveBeenCalled();

		await showChangePasswordModal("me");

		expect(mocks.changePasswordModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showChangePasswordModal).toHaveBeenCalledWith("me");
	});
});
