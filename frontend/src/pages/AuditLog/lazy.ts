import { showError } from "src/notifications";

let eventDetailsModalModule: Promise<typeof import("src/modals/EventDetailsModal")> | undefined;

const loadEventDetailsModal = () => {
	eventDetailsModalModule ??= import("src/modals/EventDetailsModal");
	return eventDetailsModalModule;
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

export { showEventDetailsModal };
