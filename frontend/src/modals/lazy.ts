import { showError } from "src/notifications";

let accessListModalModule: Promise<typeof import("./AccessListModal")> | undefined;
let customCertificateModalModule: Promise<typeof import("./CustomCertificateModal")> | undefined;
let dashboardNoteModalModule: Promise<typeof import("./DashboardNoteModal")> | undefined;
let deadHostModalModule: Promise<typeof import("./DeadHostModal")> | undefined;
let ddnsProviderModalModule: Promise<typeof import("./DdnsProviderModal")> | undefined;
let deleteConfirmModalModule: Promise<typeof import("./DeleteConfirmModal")> | undefined;
let dnsCertificateModalModule: Promise<typeof import("./DNSCertificateModal")> | undefined;
let eventDetailsModalModule: Promise<typeof import("./EventDetailsModal")> | undefined;
let httpCertificateModalModule: Promise<typeof import("./HTTPCertificateModal")> | undefined;
let helpModalModule: Promise<typeof import("./HelpModal")> | undefined;
let internalCertificateModalModule: Promise<typeof import("./InternalCertificateModal")> | undefined;
let permissionsModalModule: Promise<typeof import("./PermissionsModal")> | undefined;
let proxyHostModalModule: Promise<typeof import("./ProxyHostModal")> | undefined;
let redirectionHostModalModule: Promise<typeof import("./RedirectionHostModal")> | undefined;
let renewCertificateModalModule: Promise<typeof import("./RenewCertificateModal")> | undefined;
let setPasswordModalModule: Promise<typeof import("./SetPasswordModal")> | undefined;
let streamModalModule: Promise<typeof import("./StreamModal")> | undefined;

const loadAccessListModal = () => {
	accessListModalModule ??= import("./AccessListModal");
	return accessListModalModule;
};

const loadCustomCertificateModal = () => {
	customCertificateModalModule ??= import("./CustomCertificateModal");
	return customCertificateModalModule;
};

const loadDashboardNoteModal = () => {
	dashboardNoteModalModule ??= import("./DashboardNoteModal");
	return dashboardNoteModalModule;
};

const loadDeadHostModal = () => {
	deadHostModalModule ??= import("./DeadHostModal");
	return deadHostModalModule;
};

const loadDdnsProviderModal = () => {
	ddnsProviderModalModule ??= import("./DdnsProviderModal");
	return ddnsProviderModalModule;
};

const loadDeleteConfirmModal = () => {
	deleteConfirmModalModule ??= import("./DeleteConfirmModal");
	return deleteConfirmModalModule;
};

const loadDNSCertificateModal = () => {
	dnsCertificateModalModule ??= import("./DNSCertificateModal");
	return dnsCertificateModalModule;
};

const loadEventDetailsModal = () => {
	eventDetailsModalModule ??= import("./EventDetailsModal");
	return eventDetailsModalModule;
};

const loadHTTPCertificateModal = () => {
	httpCertificateModalModule ??= import("./HTTPCertificateModal");
	return httpCertificateModalModule;
};

const loadHelpModal = () => {
	helpModalModule ??= import("./HelpModal");
	return helpModalModule;
};

const loadInternalCertificateModal = () => {
	internalCertificateModalModule ??= import("./InternalCertificateModal");
	return internalCertificateModalModule;
};

const loadPermissionsModal = () => {
	permissionsModalModule ??= import("./PermissionsModal");
	return permissionsModalModule;
};

const loadProxyHostModal = () => {
	proxyHostModalModule ??= import("./ProxyHostModal");
	return proxyHostModalModule;
};

const loadRedirectionHostModal = () => {
	redirectionHostModalModule ??= import("./RedirectionHostModal");
	return redirectionHostModalModule;
};

const loadRenewCertificateModal = () => {
	renewCertificateModalModule ??= import("./RenewCertificateModal");
	return renewCertificateModalModule;
};

const loadSetPasswordModal = () => {
	setPasswordModalModule ??= import("./SetPasswordModal");
	return setPasswordModalModule;
};

const loadStreamModal = () => {
	streamModalModule ??= import("./StreamModal");
	return streamModalModule;
};

const showAccessListModal = async (id: number | "new") => {
	try {
		const { showAccessListModal: showModal } = await loadAccessListModal();
		showModal(id);
	} catch (error) {
		accessListModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

const showCustomCertificateModal = async () => {
	try {
		const { showCustomCertificateModal: showModal } = await loadCustomCertificateModal();
		showModal();
	} catch (error) {
		customCertificateModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

const showDashboardNoteModal = async (
	note?: Parameters<typeof import("./DashboardNoteModal").showDashboardNoteModal>[0],
) => {
	try {
		const { showDashboardNoteModal: showModal } = await loadDashboardNoteModal();
		showModal(note);
	} catch (error) {
		dashboardNoteModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

const showDeadHostModal = async (id: number | "new") => {
	try {
		const { showDeadHostModal: showModal } = await loadDeadHostModal();
		showModal(id);
	} catch (error) {
		deadHostModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

const showDdnsProviderModal = async (id?: number) => {
	try {
		const { showDdnsProviderModal: showModal } = await loadDdnsProviderModal();
		showModal(id);
	} catch (error) {
		ddnsProviderModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

const showDeleteConfirmModal = async (
	props: Parameters<typeof import("./DeleteConfirmModal").showDeleteConfirmModal>[0],
) => {
	try {
		const { showDeleteConfirmModal: showModal } = await loadDeleteConfirmModal();
		showModal(props);
	} catch (error) {
		deleteConfirmModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

const showDNSCertificateModal = async () => {
	try {
		const { showDNSCertificateModal: showModal } = await loadDNSCertificateModal();
		showModal();
	} catch (error) {
		dnsCertificateModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

const showEventDetailsModal = async (id: number) => {
	try {
		const { showEventDetailsModal: showModal } = await loadEventDetailsModal();
		showModal(id);
	} catch (error) {
		eventDetailsModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

const showHTTPCertificateModal = async () => {
	try {
		const { showHTTPCertificateModal: showModal } = await loadHTTPCertificateModal();
		showModal();
	} catch (error) {
		httpCertificateModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

const showHelpModal = async (section: string, color?: string) => {
	try {
		const { showHelpModal: showModal } = await loadHelpModal();
		showModal(section, color);
	} catch (error) {
		helpModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

const showInternalCertificateModal = async () => {
	try {
		const { showInternalCertificateModal: showModal } = await loadInternalCertificateModal();
		showModal();
	} catch (error) {
		internalCertificateModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

const showPermissionsModal = async (id: number) => {
	try {
		const { showPermissionsModal: showModal } = await loadPermissionsModal();
		showModal(id);
	} catch (error) {
		permissionsModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

const showProxyHostModal = async (id: number | "new") => {
	try {
		const { showProxyHostModal: showModal } = await loadProxyHostModal();
		showModal(id);
	} catch (error) {
		proxyHostModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

const showRedirectionHostModal = async (id: number | "new") => {
	try {
		const { showRedirectionHostModal: showModal } = await loadRedirectionHostModal();
		showModal(id);
	} catch (error) {
		redirectionHostModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

const showRenewCertificateModal = async (id: number) => {
	try {
		const { showRenewCertificateModal: showModal } = await loadRenewCertificateModal();
		showModal(id);
	} catch (error) {
		renewCertificateModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

const showSetPasswordModal = async (id: number) => {
	try {
		const { showSetPasswordModal: showModal } = await loadSetPasswordModal();
		showModal(id);
	} catch (error) {
		setPasswordModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

const showStreamModal = async (id: number | "new") => {
	try {
		const { showStreamModal: showModal } = await loadStreamModal();
		showModal(id);
	} catch (error) {
		streamModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

export {
	showAccessListModal,
	showCustomCertificateModal,
	showDashboardNoteModal,
	showDdnsProviderModal,
	showDeadHostModal,
	showDeleteConfirmModal,
	showDNSCertificateModal,
	showEventDetailsModal,
	showHelpModal,
	showHTTPCertificateModal,
	showInternalCertificateModal,
	showPermissionsModal,
	showProxyHostModal,
	showRedirectionHostModal,
	showRenewCertificateModal,
	showSetPasswordModal,
	showStreamModal,
};
