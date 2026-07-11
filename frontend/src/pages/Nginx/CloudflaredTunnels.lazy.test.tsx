import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

	it("does not statically depend on the shared modal loader", () => {
		const pageSource = readFileSync(resolve(process.cwd(), "src/pages/Nginx/CloudflaredTunnels.tsx"), "utf8");

		expect(pageSource).not.toContain("modals/lazy");
	});
});
