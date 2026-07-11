import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	accessListModalModuleLoaded: vi.fn(),
	deleteConfirmModalModuleLoaded: vi.fn(),
	helpModalModuleLoaded: vi.fn(),
	proxyHostModalError: undefined as Error | undefined,
	proxyHostModalModuleLoaded: vi.fn(),
	showAccessListModal: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
	showError: vi.fn(),
	showHelpModal: vi.fn(),
	showProxyHostModal: vi.fn(),
}));

vi.mock("src/modals/AccessListModal", () => {
	mocks.accessListModalModuleLoaded();
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

vi.mock("src/modals/ProxyHostModal", () => {
	mocks.proxyHostModalModuleLoaded();
	if (mocks.proxyHostModalError) {
		throw mocks.proxyHostModalError;
	}
	return { showProxyHostModal: mocks.showProxyHostModal };
});

vi.mock("src/notifications", () => ({ showError: mocks.showError }));

describe("Proxy Host modal wrappers", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		mocks.proxyHostModalError = undefined;
	});

	it("notifies when the Proxy Host dialog cannot load", async () => {
		mocks.proxyHostModalError = new Error("Proxy Host dialog chunk is unavailable");
		const { showProxyHostModal } = await import("./lazy");

		await showProxyHostModal(73);

		expect(mocks.showError).toHaveBeenCalledWith(expect.any(String));
		expect(mocks.showProxyHostModal).not.toHaveBeenCalled();
	});

	it("loads each Proxy Host dialog only for its matching table action", async () => {
		const { showAccessListModal, showDeleteConfirmModal, showHelpModal, showProxyHostModal } = await import(
			"./lazy"
		);

		expect(mocks.accessListModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.proxyHostModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.deleteConfirmModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.helpModalModuleLoaded).not.toHaveBeenCalled();

		await showAccessListModal(73);
		await showProxyHostModal("new");
		const deleteProps = { children: "Delete proxy host", onConfirm: vi.fn() };
		await showDeleteConfirmModal(deleteProps);
		await showHelpModal("ProxyHosts", "lime");

		expect(mocks.accessListModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.proxyHostModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.deleteConfirmModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.helpModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showAccessListModal).toHaveBeenCalledWith(73);
		expect(mocks.showProxyHostModal).toHaveBeenCalledWith("new");
		expect(mocks.showDeleteConfirmModal).toHaveBeenCalledWith(deleteProps);
		expect(mocks.showHelpModal).toHaveBeenCalledWith("ProxyHosts", "lime");
	});
});
