export * from "./ChangePasswordModal";
export * from "./CustomCertificateModal";
export * from "./DashboardNoteModal";
export * from "./DeleteConfirmModal";
export * from "./DNSCertificateModal";
export * from "./EventDetailsModal";
export * from "./HelpModal";
export * from "./HTTPCertificateModal";
export * from "./InternalCertificateModal";
export * from "./RenewCertificateModal";
export * from "./SetPasswordModal";

export const showAccessListModal = async (
	...args: Parameters<typeof import("./AccessListModal")["showAccessListModal"]>
) => {
	const module = await import("./AccessListModal");
	return module.showAccessListModal(...args);
};

export const showDdnsProviderModal = async (
	...args: Parameters<typeof import("./DdnsProviderModal")["showDdnsProviderModal"]>
) => {
	const module = await import("./DdnsProviderModal");
	return module.showDdnsProviderModal(...args);
};

export const showDeadHostModal = async (...args: Parameters<typeof import("./DeadHostModal")["showDeadHostModal"]>) => {
	const module = await import("./DeadHostModal");
	return module.showDeadHostModal(...args);
};

export const showPermissionsModal = async (
	...args: Parameters<typeof import("./PermissionsModal")["showPermissionsModal"]>
) => {
	const module = await import("./PermissionsModal");
	return module.showPermissionsModal(...args);
};

export const showProxyHostModal = async (
	...args: Parameters<typeof import("./ProxyHostModal")["showProxyHostModal"]>
) => {
	const module = await import("./ProxyHostModal");
	return module.showProxyHostModal(...args);
};

export const showRedirectionHostModal = async (
	...args: Parameters<typeof import("./RedirectionHostModal")["showRedirectionHostModal"]>
) => {
	const module = await import("./RedirectionHostModal");
	return module.showRedirectionHostModal(...args);
};

export const showStreamModal = async (...args: Parameters<typeof import("./StreamModal")["showStreamModal"]>) => {
	const module = await import("./StreamModal");
	return module.showStreamModal(...args);
};

export const showUserModal = async (...args: Parameters<typeof import("./UserModal")["showUserModal"]>) => {
	const module = await import("./UserModal");
	return module.showUserModal(...args);
};
