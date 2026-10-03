import { showError } from "src/notifications";

let firewallListModalModule: Promise<typeof import("src/modals/FirewallListModal")> | undefined;
let deleteConfirmModalModule: Promise<typeof import("src/modals/DeleteConfirmModal")> | undefined;

export async function showFirewallListModal(
	...args: Parameters<typeof import("src/modals/FirewallListModal").showFirewallListModal>
) {
	try {
		firewallListModalModule ??= import("src/modals/FirewallListModal");
		const module = await firewallListModalModule;
		module.showFirewallListModal(...args);
	} catch (error) {
		firewallListModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
}

export async function showDeleteConfirmModal(
	props: Parameters<typeof import("src/modals/DeleteConfirmModal").showDeleteConfirmModal>[0],
) {
	try {
		deleteConfirmModalModule ??= import("src/modals/DeleteConfirmModal");
		const module = await deleteConfirmModalModule;
		module.showDeleteConfirmModal(props);
	} catch (error) {
		deleteConfirmModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
}
