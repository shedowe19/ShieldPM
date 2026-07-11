import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	customCertificateModalModuleLoaded: vi.fn(),
	deleteConfirmModalModuleLoaded: vi.fn(),
	dnsCertificateModalModuleLoaded: vi.fn(),
	helpModalModuleLoaded: vi.fn(),
	httpCertificateModalModuleLoaded: vi.fn(),
	internalCertificateModalModuleLoaded: vi.fn(),
	renewCertificateModalModuleLoaded: vi.fn(),
	showCustomCertificateModal: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
	showDNSCertificateModal: vi.fn(),
	showHelpModal: vi.fn(),
	showHTTPCertificateModal: vi.fn(),
	showInternalCertificateModal: vi.fn(),
	showRenewCertificateModal: vi.fn(),
}));

vi.mock("src/modals/CustomCertificateModal", () => {
	mocks.customCertificateModalModuleLoaded();
	return { showCustomCertificateModal: mocks.showCustomCertificateModal };
});

vi.mock("src/modals/DNSCertificateModal", () => {
	mocks.dnsCertificateModalModuleLoaded();
	return { showDNSCertificateModal: mocks.showDNSCertificateModal };
});

vi.mock("src/modals/DeleteConfirmModal", () => {
	mocks.deleteConfirmModalModuleLoaded();
	return { showDeleteConfirmModal: mocks.showDeleteConfirmModal };
});

vi.mock("src/modals/HelpModal", () => {
	mocks.helpModalModuleLoaded();
	return { showHelpModal: mocks.showHelpModal };
});

vi.mock("src/modals/HTTPCertificateModal", () => {
	mocks.httpCertificateModalModuleLoaded();
	return { showHTTPCertificateModal: mocks.showHTTPCertificateModal };
});

vi.mock("src/modals/InternalCertificateModal", () => {
	mocks.internalCertificateModalModuleLoaded();
	return { showInternalCertificateModal: mocks.showInternalCertificateModal };
});

vi.mock("src/modals/RenewCertificateModal", () => {
	mocks.renewCertificateModalModuleLoaded();
	return { showRenewCertificateModal: mocks.showRenewCertificateModal };
});

vi.mock("src/notifications", () => ({ showError: vi.fn() }));

describe("certificate modal wrappers", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it("loads only the modal requested by a certificate route action", async () => {
		const {
			showCustomCertificateModal,
			showDeleteConfirmModal,
			showDNSCertificateModal,
			showHelpModal,
			showHTTPCertificateModal,
			showInternalCertificateModal,
			showRenewCertificateModal,
		} = await import("./lazy");

		expect(mocks.customCertificateModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.deleteConfirmModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.dnsCertificateModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.helpModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.httpCertificateModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.internalCertificateModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.renewCertificateModalModuleLoaded).not.toHaveBeenCalled();

		await showCustomCertificateModal();
		const deleteProps = { children: "Delete certificate", onConfirm: vi.fn() };
		await showDeleteConfirmModal(deleteProps);
		await showDNSCertificateModal();
		await showHelpModal("Certificates", "pink");
		await showHTTPCertificateModal();
		await showInternalCertificateModal();
		await showRenewCertificateModal(73);

		expect(mocks.customCertificateModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.deleteConfirmModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.dnsCertificateModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.helpModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.httpCertificateModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.internalCertificateModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.renewCertificateModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showCustomCertificateModal).toHaveBeenCalledOnce();
		expect(mocks.showDeleteConfirmModal).toHaveBeenCalledWith(deleteProps);
		expect(mocks.showDNSCertificateModal).toHaveBeenCalledOnce();
		expect(mocks.showHelpModal).toHaveBeenCalledWith("Certificates", "pink");
		expect(mocks.showHTTPCertificateModal).toHaveBeenCalledOnce();
		expect(mocks.showInternalCertificateModal).toHaveBeenCalledOnce();
		expect(mocks.showRenewCertificateModal).toHaveBeenCalledWith(73);
	});
});
