import { showError } from "src/notifications";

let accessListModalModule: Promise<typeof import("./AccessListModal")> | undefined;
let changePasswordModalModule: Promise<typeof import("./ChangePasswordModal")> | undefined;
let dashboardNoteModalModule: Promise<typeof import("./DashboardNoteModal")> | undefined;
let deleteConfirmModalModule: Promise<typeof import("./DeleteConfirmModal")> | undefined;
let helpModalModule: Promise<typeof import("./HelpModal")> | undefined;
let permissionsModalModule: Promise<typeof import("./PermissionsModal")> | undefined;
let proxyHostModalModule: Promise<typeof import("./ProxyHostModal")> | undefined;
let redirectionHostModalModule: Promise<typeof import("./RedirectionHostModal")> | undefined;
let setPasswordModalModule: Promise<typeof import("./SetPasswordModal")> | undefined;
let streamModalModule: Promise<typeof import("./StreamModal")> | undefined;
let userModalModule: Promise<typeof import("./UserModal")> | undefined;

const loadAccessListModal = () => {
	accessListModalModule ??= import("./AccessListModal");
	return accessListModalModule;
};

const loadChangePasswordModal = () => {
	changePasswordModalModule ??= import("./ChangePasswordModal");
	return changePasswordModalModule;
};

const loadDashboardNoteModal = () => {
	dashboardNoteModalModule ??= import("./DashboardNoteModal");
	return dashboardNoteModalModule;
};

const loadDeleteConfirmModal = () => {
	deleteConfirmModalModule ??= import("./DeleteConfirmModal");
	return deleteConfirmModalModule;
};

const loadHelpModal = () => {
	helpModalModule ??= import("./HelpModal");
	return helpModalModule;
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

const loadSetPasswordModal = () => {
	setPasswordModalModule ??= import("./SetPasswordModal");
	return setPasswordModalModule;
};

const loadStreamModal = () => {
	streamModalModule ??= import("./StreamModal");
	return streamModalModule;
};

const loadUserModal = () => {
	userModalModule ??= import("./UserModal");
	return userModalModule;
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

const showChangePasswordModal = async (id: number | "me") => {
	try {
		const { showChangePasswordModal: showModal } = await loadChangePasswordModal();
		showModal(id);
	} catch (error) {
		changePasswordModalModule = undefined;
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

const showHelpModal = async (section: string, color?: string) => {
	try {
		const { showHelpModal: showModal } = await loadHelpModal();
		showModal(section, color);
	} catch (error) {
		helpModalModule = undefined;
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

const showUserModal = async (id: number | "me" | "new") => {
	try {
		const { showUserModal: showModal } = await loadUserModal();
		showModal(id);
	} catch (error) {
		userModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

export {
	showAccessListModal,
	showChangePasswordModal,
	showDashboardNoteModal,
	showDeleteConfirmModal,
	showHelpModal,
	showPermissionsModal,
	showProxyHostModal,
	showRedirectionHostModal,
	showSetPasswordModal,
	showStreamModal,
	showUserModal,
};
