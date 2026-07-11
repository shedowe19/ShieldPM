import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	helpModalModuleLoaded: vi.fn(),
	showError: vi.fn(),
	showHelpModal: vi.fn(),
}));

vi.mock("@/modals/HelpModal", () => {
	mocks.helpModalModuleLoaded();
	return { showHelpModal: mocks.showHelpModal };
});

vi.mock("@/notifications", () => ({ showError: mocks.showError }));

describe("WireGuard Tunnels help modal wrapper", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it("loads the dedicated help modal only when help is requested", async () => {
		const { showWireguardTunnelsHelpModal } = await import("./WireguardTunnels.lazy");

		expect(mocks.helpModalModuleLoaded).not.toHaveBeenCalled();

		await showWireguardTunnelsHelpModal();

		expect(mocks.helpModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showHelpModal).toHaveBeenCalledWith("WireguardTunnels", "purple");
	});

	it("notifies when the dedicated help modal cannot open", async () => {
		mocks.showHelpModal.mockImplementationOnce(() => {
			throw new Error("Help modal chunk is unavailable");
		});
		const { showWireguardTunnelsHelpModal } = await import("./WireguardTunnels.lazy");

		await showWireguardTunnelsHelpModal();

		expect(mocks.showError).toHaveBeenCalledWith("Help modal chunk is unavailable");
	});
});
