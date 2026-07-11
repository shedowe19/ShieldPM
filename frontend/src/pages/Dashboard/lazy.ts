import { showError } from "src/notifications";

let dashboardNoteModalModule: Promise<typeof import("src/modals/DashboardNoteModal")> | undefined;

const loadDashboardNoteModal = () => {
	dashboardNoteModalModule ??= import("src/modals/DashboardNoteModal");
	return dashboardNoteModalModule;
};

const showDashboardNoteModal = async (
	note?: Parameters<typeof import("src/modals/DashboardNoteModal").showDashboardNoteModal>[0],
) => {
	try {
		const { showDashboardNoteModal: showModal } = await loadDashboardNoteModal();
		showModal(note);
	} catch (error) {
		dashboardNoteModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

export { showDashboardNoteModal };
