import { showError } from "src/notifications";

let accessListModalModule: Promise<typeof import("src/modals/AccessListModal")> | undefined;
let deleteConfirmModalModule: Promise<typeof import("src/modals/DeleteConfirmModal")> | undefined;
let helpModalModule: Promise<typeof import("src/modals/HelpModal")> | undefined;
let proxyHostModalModule: Promise<typeof import("src/modals/ProxyHostModal")> | undefined;

const loadAccessListModal = () => {
	accessListModalModule ??= import("src/modals/AccessListModal");
	return accessListModalModule;
};

const loadDeleteConfirmModal = () => {
	deleteConfirmModalModule ??= import("src/modals/DeleteConfirmModal");
	return deleteConfirmModalModule;
};

const loadHelpModal = () => {
	helpModalModule ??= import("src/modals/HelpModal");
	return helpModalModule;
};

const loadProxyHostModal = () => {
	proxyHostModalModule ??= import("src/modals/ProxyHostModal");
	return proxyHostModalModule;
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

const showHelpModal = async (section: string, color?: string) => {
	try {
		const { showHelpModal: showModal } = await loadHelpModal();
		showModal(section, color);
	} catch (error) {
		helpModalModule = undefined;
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

export { showAccessListModal, showDeleteConfirmModal, showHelpModal, showProxyHostModal };
