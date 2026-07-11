import { showError } from "src/notifications";

let deleteConfirmModalModule: Promise<typeof import("src/modals/DeleteConfirmModal")> | undefined;
let permissionsModalModule: Promise<typeof import("src/modals/PermissionsModal")> | undefined;
let setPasswordModalModule: Promise<typeof import("src/modals/SetPasswordModal")> | undefined;

const loadDeleteConfirmModal = () => {
	deleteConfirmModalModule ??= import("src/modals/DeleteConfirmModal");
	return deleteConfirmModalModule;
};

const loadPermissionsModal = () => {
	permissionsModalModule ??= import("src/modals/PermissionsModal");
	return permissionsModalModule;
};

const loadSetPasswordModal = () => {
	setPasswordModalModule ??= import("src/modals/SetPasswordModal");
	return setPasswordModalModule;
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

const showPermissionsModal = async (id: number) => {
	try {
		const { showPermissionsModal: showModal } = await loadPermissionsModal();
		showModal(id);
	} catch (error) {
		permissionsModalModule = undefined;
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

export { showDeleteConfirmModal, showPermissionsModal, showSetPasswordModal };
