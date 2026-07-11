import { showError } from "src/notifications";

let deleteConfirmModalModule: Promise<typeof import("src/modals/DeleteConfirmModal")> | undefined;
let helpModalModule: Promise<typeof import("src/modals/HelpModal")> | undefined;
let redirectionHostModalModule: Promise<typeof import("src/modals/RedirectionHostModal")> | undefined;

const loadDeleteConfirmModal = () => {
	deleteConfirmModalModule ??= import("src/modals/DeleteConfirmModal");
	return deleteConfirmModalModule;
};

const loadHelpModal = () => {
	helpModalModule ??= import("src/modals/HelpModal");
	return helpModalModule;
};

const loadRedirectionHostModal = () => {
	redirectionHostModalModule ??= import("src/modals/RedirectionHostModal");
	return redirectionHostModalModule;
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

const showRedirectionHostModal = async (id: number | "new") => {
	try {
		const { showRedirectionHostModal: showModal } = await loadRedirectionHostModal();
		showModal(id);
	} catch (error) {
		redirectionHostModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

export { showDeleteConfirmModal, showHelpModal, showRedirectionHostModal };
