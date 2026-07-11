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

describe("Tor Onion Services help modal wrapper", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it("loads the dedicated help modal only when help is requested", async () => {
		const { showTorOnionServicesHelpModal } = await import("./TorOnionServices.lazy");

		expect(mocks.helpModalModuleLoaded).not.toHaveBeenCalled();

		await showTorOnionServicesHelpModal();

		expect(mocks.helpModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showHelpModal).toHaveBeenCalledWith("TorOnionServices", "purple");
	});

	it("notifies when the dedicated help modal cannot open", async () => {
		mocks.showHelpModal.mockImplementationOnce(() => {
			throw new Error("Help modal chunk is unavailable");
		});
		const { showTorOnionServicesHelpModal } = await import("./TorOnionServices.lazy");

		await showTorOnionServicesHelpModal();

		expect(mocks.showError).toHaveBeenCalledWith("Help modal chunk is unavailable");
	});
});
