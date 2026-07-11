import { showError } from "src/notifications";

let ddnsProviderModalModule: Promise<typeof import("src/modals/DdnsProviderModal")> | undefined;
let deleteConfirmModalModule: Promise<typeof import("src/modals/DeleteConfirmModal")> | undefined;
let helpModalModule: Promise<typeof import("src/modals/HelpModal")> | undefined;

const loadDdnsProviderModal = () => {
	ddnsProviderModalModule ??= import("src/modals/DdnsProviderModal");
	return ddnsProviderModalModule;
};

const loadDeleteConfirmModal = () => {
	deleteConfirmModalModule ??= import("src/modals/DeleteConfirmModal");
	return deleteConfirmModalModule;
};

const loadHelpModal = () => {
	helpModalModule ??= import("src/modals/HelpModal");
	return helpModalModule;
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

export { showDdnsProviderModal, showDeleteConfirmModal, showHelpModal };
