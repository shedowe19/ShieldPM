import { showError } from "src/notifications";

let customCertificateModalModule: Promise<typeof import("src/modals/CustomCertificateModal")> | undefined;
let deleteConfirmModalModule: Promise<typeof import("src/modals/DeleteConfirmModal")> | undefined;
let dnsCertificateModalModule: Promise<typeof import("src/modals/DNSCertificateModal")> | undefined;
let helpModalModule: Promise<typeof import("src/modals/HelpModal")> | undefined;
let httpCertificateModalModule: Promise<typeof import("src/modals/HTTPCertificateModal")> | undefined;
let internalCertificateModalModule: Promise<typeof import("src/modals/InternalCertificateModal")> | undefined;
let renewCertificateModalModule: Promise<typeof import("src/modals/RenewCertificateModal")> | undefined;

const loadCustomCertificateModal = () => {
	customCertificateModalModule ??= import("src/modals/CustomCertificateModal");
	return customCertificateModalModule;
};

const loadDeleteConfirmModal = () => {
	deleteConfirmModalModule ??= import("src/modals/DeleteConfirmModal");
	return deleteConfirmModalModule;
};

const loadDNSCertificateModal = () => {
	dnsCertificateModalModule ??= import("src/modals/DNSCertificateModal");
	return dnsCertificateModalModule;
};

const loadHelpModal = () => {
	helpModalModule ??= import("src/modals/HelpModal");
	return helpModalModule;
};

const loadHTTPCertificateModal = () => {
	httpCertificateModalModule ??= import("src/modals/HTTPCertificateModal");
	return httpCertificateModalModule;
};

const loadInternalCertificateModal = () => {
	internalCertificateModalModule ??= import("src/modals/InternalCertificateModal");
	return internalCertificateModalModule;
};

const loadRenewCertificateModal = () => {
	renewCertificateModalModule ??= import("src/modals/RenewCertificateModal");
	return renewCertificateModalModule;
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

const showDeleteConfirmModal = async (
	props: Parameters<typeof import("src/modals/DeleteConfirmModal").showDeleteConfirmModal>[0],
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

const showHelpModal = async (section: string, color?: string) => {
	try {
		const { showHelpModal: showModal } = await loadHelpModal();
		showModal(section, color);
	} catch (error) {
		helpModalModule = undefined;
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

const showInternalCertificateModal = async () => {
	try {
		const { showInternalCertificateModal: showModal } = await loadInternalCertificateModal();
		showModal();
	} catch (error) {
		internalCertificateModalModule = undefined;
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

export {
	showCustomCertificateModal,
	showDeleteConfirmModal,
	showDNSCertificateModal,
	showHelpModal,
	showHTTPCertificateModal,
	showInternalCertificateModal,
	showRenewCertificateModal,
};
