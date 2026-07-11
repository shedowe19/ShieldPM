import { showError } from "src/notifications";

let deadHostModalModule: Promise<typeof import("src/modals/DeadHostModal")> | undefined;
let deleteConfirmModalModule: Promise<typeof import("src/modals/DeleteConfirmModal")> | undefined;
let helpModalModule: Promise<typeof import("src/modals/HelpModal")> | undefined;

const loadDeadHostModal = () => {
	deadHostModalModule ??= import("src/modals/DeadHostModal");
	return deadHostModalModule;
};

const loadDeleteConfirmModal = () => {
	deleteConfirmModalModule ??= import("src/modals/DeleteConfirmModal");
	return deleteConfirmModalModule;
};

const loadHelpModal = () => {
	helpModalModule ??= import("src/modals/HelpModal");
	return helpModalModule;
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

export { showDeadHostModal, showDeleteConfirmModal, showHelpModal };
