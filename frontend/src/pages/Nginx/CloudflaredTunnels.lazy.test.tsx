import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	helpModalModuleLoaded: vi.fn(),
	showError: vi.fn(),
	showHelpModal: vi.fn(),
}));

vi.mock("@/modals/lazy", () => {
	throw new Error("Cloudflared Tunnels must not load the shared modal loader");
});

vi.mock("@/modals/HelpModal", () => {
	mocks.helpModalModuleLoaded();
	return { showHelpModal: mocks.showHelpModal };
});

vi.mock("@/notifications", () => ({ showError: mocks.showError }));

vi.mock("@/components/Nginx/CloudflaredTunnelModal", () => ({
	CloudflaredTunnelModal: () => null,
}));

describe("CloudflaredTunnels", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it("loads the dedicated help modal only when help is requested", async () => {
		const { showCloudflaredHelpModal } = await import("./CloudflaredTunnels.lazy");

		expect(mocks.helpModalModuleLoaded).not.toHaveBeenCalled();

		await showCloudflaredHelpModal();

		expect(mocks.helpModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showHelpModal).toHaveBeenCalledWith("CloudflaredTunnels", "orange");
	});

	it("shows an error when the dedicated help modal cannot open", async () => {
		mocks.showHelpModal.mockImplementationOnce(() => {
			throw new Error("Help modal chunk is unavailable");
		});
		const { showCloudflaredHelpModal } = await import("./CloudflaredTunnels.lazy");

		await showCloudflaredHelpModal();

		expect(mocks.showError).toHaveBeenCalledWith("Help modal chunk is unavailable");
	});

	it("loads without the shared modal loader", async () => {
		await expect(import("./CloudflaredTunnels")).resolves.toHaveProperty("default");
	});
});
