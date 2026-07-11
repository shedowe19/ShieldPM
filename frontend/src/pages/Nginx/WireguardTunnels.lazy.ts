import { showError } from "@/notifications";

let helpModalModule: Promise<typeof import("@/modals/HelpModal")> | undefined;

const loadHelpModal = () => {
	helpModalModule ??= import("@/modals/HelpModal");
	return helpModalModule;
};

const showWireguardTunnelsHelpModal = async () => {
	try {
		const { showHelpModal } = await loadHelpModal();
		showHelpModal("WireguardTunnels", "purple");
	} catch (error) {
		helpModalModule = undefined;
		showError(error instanceof Error ? error.message : String(error));
	}
};

export { showWireguardTunnelsHelpModal };
