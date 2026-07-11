import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	dashboardNoteModalError: undefined as Error | undefined,
	dashboardNoteModalModuleLoaded: vi.fn(),
	showDashboardNoteModal: vi.fn(),
	showError: vi.fn(),
}));

vi.mock("src/modals/DashboardNoteModal", () => {
	mocks.dashboardNoteModalModuleLoaded();
	if (mocks.dashboardNoteModalError) {
		throw mocks.dashboardNoteModalError;
	}
	return { showDashboardNoteModal: mocks.showDashboardNoteModal };
});

vi.mock("src/notifications", () => ({ showError: mocks.showError }));

describe("Dashboard modal loader", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		mocks.dashboardNoteModalError = undefined;
	});

	it("shows an error when the deferred dashboard note modal cannot load", async () => {
		mocks.dashboardNoteModalError = new Error("Dashboard note modal chunk is unavailable");
		const { showDashboardNoteModal } = await import("./lazy");

		await showDashboardNoteModal();

		expect(mocks.showError).toHaveBeenCalledWith(expect.any(String));
		expect(mocks.showDashboardNoteModal).not.toHaveBeenCalled();
	});

	it("loads the dashboard note modal only when note editing is requested", async () => {
		const { showDashboardNoteModal } = await import("./lazy");
		const note = { content: "Rotate certificates", id: 73 };

		expect(mocks.dashboardNoteModalModuleLoaded).not.toHaveBeenCalled();

		await showDashboardNoteModal(note);

		expect(mocks.dashboardNoteModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showDashboardNoteModal).toHaveBeenCalledWith(note);
	});
});
