import { showError } from "src/notifications";

let changePasswordModalModule: Promise<typeof import("./ChangePasswordModal")> | undefined;
let proxyHostModalModule: Promise<typeof import("./ProxyHostModal")> | undefined;
let userModalModule: Promise<typeof import("./UserModal")> | undefined;

const loadChangePasswordModal = () => {
	changePasswordModalModule ??= import("./ChangePasswordModal");
	return changePasswordModalModule;
};

const loadProxyHostModal = () => {
	proxyHostModalModule ??= import("./ProxyHostModal");
	return proxyHostModalModule;
};

const loadUserModal = () => {
	userModalModule ??= import("./UserModal");
	return userModalModule;
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

const showProxyHostModal = async (id: number | "new") => {
	try {
		const { showProxyHostModal: showModal } = await loadProxyHostModal();
		showModal(id);
	} catch (error) {
		proxyHostModalModule = undefined;
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

export { showChangePasswordModal, showProxyHostModal, showUserModal };
