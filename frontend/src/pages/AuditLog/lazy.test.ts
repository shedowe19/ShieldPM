import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	eventDetailsModalError: undefined as Error | undefined,
	eventDetailsModalModuleLoaded: vi.fn(),
	showError: vi.fn(),
	showEventDetailsModal: vi.fn(),
}));

vi.mock("src/modals/EventDetailsModal", () => {
	mocks.eventDetailsModalModuleLoaded();
	if (mocks.eventDetailsModalError) {
		throw mocks.eventDetailsModalError;
	}
	return { showEventDetailsModal: mocks.showEventDetailsModal };
});

vi.mock("src/notifications", () => ({ showError: mocks.showError }));

describe("audit log modal wrapper", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		mocks.eventDetailsModalError = undefined;
	});

	it("notifies when the event details dialog cannot load", async () => {
		mocks.eventDetailsModalError = new Error("Event details dialog chunk is unavailable");
		const { showEventDetailsModal } = await import("./lazy");

		await showEventDetailsModal(73);

		expect(mocks.showError).toHaveBeenCalledWith(expect.any(String));
		expect(mocks.showEventDetailsModal).not.toHaveBeenCalled();
	});

	it("loads event details only when an audit entry is selected", async () => {
		const { showEventDetailsModal } = await import("./lazy");

		expect(mocks.eventDetailsModalModuleLoaded).not.toHaveBeenCalled();

		await showEventDetailsModal(73);

		expect(mocks.eventDetailsModalModuleLoaded).toHaveBeenCalledOnce();
		expect(mocks.showEventDetailsModal).toHaveBeenCalledWith(73);
	});
});
