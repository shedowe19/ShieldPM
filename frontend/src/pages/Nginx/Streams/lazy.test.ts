import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	deleteConfirmModalModuleLoaded: vi.fn(),
	helpModalModuleLoaded: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
	showError: vi.fn(),
	showHelpModal: vi.fn(),
	showStreamModal: vi.fn(),
	streamModalModuleError: undefined as Error | undefined,
	streamModalModuleLoaded: vi.fn(),
}));

vi.mock("src/modals/DeleteConfirmModal", () => {
	mocks.deleteConfirmModalModuleLoaded();
	return { showDeleteConfirmModal: mocks.showDeleteConfirmModal };
});

vi.mock("src/modals/HelpModal", () => {
	mocks.helpModalModuleLoaded();
	return { showHelpModal: mocks.showHelpModal };
});

vi.mock("src/modals/StreamModal", () => {
	mocks.streamModalModuleLoaded();
	if (mocks.streamModalModuleError) {
		throw mocks.streamModalModuleError;
	}
	return { showStreamModal: mocks.showStreamModal };
});

vi.mock("src/notifications", () => ({ showError: mocks.showError }));

describe("Streams modal loaders", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		mocks.streamModalModuleError = undefined;
	});

	it("shows an error when the deferred Stream modal cannot load", async () => {
		mocks.streamModalModuleError = new Error("Stream modal chunk is unavailable");
		const { showStreamModal } = await import("./lazy");

		await showStreamModal(73);

		expect(mocks.showError).toHaveBeenCalledWith(expect.any(String));
		expect(mocks.showStreamModal).not.toHaveBeenCalled();
	});

	it("loads each Streams modal only when its action is requested", async () => {
		const { showDeleteConfirmModal, showHelpModal, showStreamModal } = await import("./lazy");
		const props = { children: "Delete stream", onConfirm: vi.fn() };

		expect(mocks.deleteConfirmModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.helpModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.streamModalModuleLoaded).not.toHaveBeenCalled();

		await showStreamModal(73);

		expect(mocks.showStreamModal).toHaveBeenCalledWith(73);
		expect(mocks.deleteConfirmModalModuleLoaded).not.toHaveBeenCalled();
		expect(mocks.helpModalModuleLoaded).not.toHaveBeenCalled();

		await showDeleteConfirmModal(props);
		await showHelpModal("Streams", "blue");

		expect(mocks.showDeleteConfirmModal).toHaveBeenCalledWith(props);
		expect(mocks.showHelpModal).toHaveBeenCalledWith("Streams", "blue");
	});
});
