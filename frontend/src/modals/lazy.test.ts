import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	accessListModalModuleLoaded: vi.fn(),
	customCertificateModalModuleLoaded: vi.fn(),
	deadHostModalModuleLoaded: vi.fn(),
	dashboardNoteModalModuleLoaded: vi.fn(),
	ddnsProviderModalModuleLoaded: vi.fn(),
	deleteConfirmModalModuleLoaded: vi.fn(),
	dnsCertificateModalModuleLoaded: vi.fn(),
	eventDetailsModalModuleLoaded: vi.fn(),
	httpCertificateModalModuleLoaded: vi.fn(),
	helpModalModuleLoaded: vi.fn(),
	internalCertificateModalModuleLoaded: vi.fn(),
	modalModuleError: undefined as Error | undefined,
	modalModuleLoaded: vi.fn(),
	permissionsModalModuleLoaded: vi.fn(),
	redirectionHostModalModuleLoaded: vi.fn(),
	renewCertificateModalModuleLoaded: vi.fn(),
	setPasswordModalModuleLoaded: vi.fn(),
	showAccessListModal: vi.fn(),
	showCustomCertificateModal: vi.fn(),
	showDeadHostModal: vi.fn(),
	showDdnsProviderModal: vi.fn(),
	showDNSCertificateModal: vi.fn(),
	showEventDetailsModal: vi.fn(),
	showHTTPCertificateModal: vi.fn(),
	showInternalCertificateModal: vi.fn(),
	showRenewCertificateModal: vi.fn(),
	showStreamModal: vi.fn(),
	streamModalModuleLoaded: vi.fn(),
	showDashboardNoteModal: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
	showError: vi.fn(),
	showHelpModal: vi.fn(),
	showPermissionsModal: vi.fn(),
	showProxyHostModal: vi.fn(),
	showRedirectionHostModal: vi.fn(),
	showSetPasswordModal: vi.fn(),
}));

vi.mock("./AccessListModal", () => {
	mocks.accessListModalModuleLoaded();
	return { showAccessListModal: mocks.showAccessListModal };
});

vi.mock("./DdnsProviderModal", () => {
	mocks.ddnsProviderModalModuleLoaded();
	return { showDdnsProviderModal: mocks.showDdnsProviderModal };
});

vi.mock("./DeadHostModal", () => {
	mocks.deadHostModalModuleLoaded();
	return { showDeadHostModal: mocks.showDeadHostModal };
});

vi.mock("./EventDetailsModal", () => {
	mocks.eventDetailsModalModuleLoaded();
	return { showEventDetailsModal: mocks.showEventDetailsModal };
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

vi.mock("./RedirectionHostModal", () => {
	mocks.redirectionHostModalModuleLoaded();
	return { showRedirectionHostModal: mocks.showRedirectionHostModal };
});

vi.mock("./SetPasswordModal", () => {
	mocks.setPasswordModalModuleLoaded();
	return { showSetPasswordModal: mocks.showSetPasswordModal };
});

vi.mock("./StreamModal", () => {
	mocks.streamModalModuleLoaded();
	return { showStreamModal: mocks.showStreamModal };
});

vi.mock("./CustomCertificateModal", () => {
	mocks.customCertificateModalModuleLoaded();
	return { showCustomCertificateModal: mocks.showCustomCertificateModal };
});

vi.mock("./DashboardNoteModal", () => {
	mocks.dashboardNoteModalModuleLoaded();
	return { showDashboardNoteModal: mocks.showDashboardNoteModal };
});

vi.mock("./DeleteConfirmModal", () => {
	mocks.deleteConfirmModalModuleLoaded();
	return { showDeleteConfirmModal: mocks.showDeleteConfirmModal };
});

vi.mock("./DNSCertificateModal", () => {
	mocks.dnsCertificateModalModuleLoaded();
	return { showDNSCertificateModal: mocks.showDNSCertificateModal };
});

vi.mock("./HelpModal", () => {
	mocks.helpModalModuleLoaded();
	return { showHelpModal: mocks.showHelpModal };
});

vi.mock("./HTTPCertificateModal", () => {
	mocks.httpCertificateModalModuleLoaded();
	return { showHTTPCertificateModal: mocks.showHTTPCertificateModal };
});

vi.mock("./InternalCertificateModal", () => {
	mocks.internalCertificateModalModuleLoaded();
	return { showInternalCertificateModal: mocks.showInternalCertificateModal };
});

vi.mock("./RenewCertificateModal", () => {
	mocks.renewCertificateModalModuleLoaded();
	return { showRenewCertificateModal: mocks.showRenewCertificateModal };
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

	it("loads certificate modals only when their actions are requested", async () => {
		const {
			showCustomCertificateModal,
			showDNSCertificateModal,
			showHTTPCertificateModal,
			showInternalCertificateModal,
			showRenewCertificateModal,
		} = await import("./lazy");

		expect(mocks.customCertificateModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.dnsCertificateModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.httpCertificateModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.internalCertificateModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.renewCertificateModalModuleLoaded).not.toHaveBeenCalled();

		await showCustomCertificateModal();
		await showDNSCertificateModal();
		await showHTTPCertificateModal();
		await showInternalCertificateModal();
		await showRenewCertificateModal(73);

		expect(mocks.customCertificateModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.dnsCertificateModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.httpCertificateModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.internalCertificateModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.renewCertificateModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showCustomCertificateModal).toHaveBeenCalledOnce();
		expect(mocks.showDNSCertificateModal).toHaveBeenCalledOnce();
		expect(mocks.showHTTPCertificateModal).toHaveBeenCalledOnce();
		expect(mocks.showInternalCertificateModal).toHaveBeenCalledOnce();
		expect(mocks.showRenewCertificateModal).toHaveBeenCalledWith(73);
	});

	it("loads the DDNS provider modal only when provider editing is requested", async () => {
		const { showDdnsProviderModal } = await import("./lazy");

		expect(mocks.ddnsProviderModalModuleLoaded).not.toHaveBeenCalled();

		await showDdnsProviderModal(73);

		expect(mocks.ddnsProviderModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showDdnsProviderModal).toHaveBeenCalledWith(73);
	});

	it("loads the Dead Host modal only when dead host editing is requested", async () => {
		const { showDeadHostModal } = await import("./lazy");

		expect(mocks.deadHostModalModuleLoaded).not.toHaveBeenCalled();

		await showDeadHostModal("new");

		expect(mocks.deadHostModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showDeadHostModal).toHaveBeenCalledWith("new");
	});

	it("loads event details only when an audit entry is selected", async () => {
		const { showEventDetailsModal } = await import("./lazy");

		expect(mocks.eventDetailsModalModuleLoaded).not.toHaveBeenCalled();

		await showEventDetailsModal(73);

		expect(mocks.eventDetailsModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showEventDetailsModal).toHaveBeenCalledWith(73);
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

	it("loads the Redirection Host modal only when editing is requested", async () => {
		const { showRedirectionHostModal } = await import("./lazy");

		expect(mocks.redirectionHostModalModuleLoaded).not.toHaveBeenCalled();

		await showRedirectionHostModal("new");

		expect(mocks.redirectionHostModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showRedirectionHostModal).toHaveBeenCalledWith("new");
	});

	it("loads the Stream modal only when stream editing is requested", async () => {
		const { showStreamModal } = await import("./lazy");

		expect(mocks.streamModalModuleLoaded).not.toHaveBeenCalled();

		await showStreamModal(73);

		expect(mocks.streamModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showStreamModal).toHaveBeenCalledWith(73);
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

	it("loads the help modal only when help is requested", async () => {
		const { showHelpModal } = await import("./lazy");

		expect(mocks.helpModalModuleLoaded).not.toHaveBeenCalled();

		await showHelpModal("ProxyHosts", "lime");

		expect(mocks.helpModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showHelpModal).toHaveBeenCalledWith("ProxyHosts", "lime");
	});

	it("loads the dashboard note modal only when note editing is requested", async () => {
		const { showDashboardNoteModal } = await import("./lazy");
		const note = { content: "Rotate certificates", id: 73 };

		expect(mocks.dashboardNoteModalModuleLoaded).not.toHaveBeenCalled();

		await showDashboardNoteModal(note);

		expect(mocks.dashboardNoteModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showDashboardNoteModal).toHaveBeenCalledWith(note);
	});
});
