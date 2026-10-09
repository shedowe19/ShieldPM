import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showDeleteConfirmModal } from "./DeleteConfirmModal";

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	onConfirm: vi.fn(),
	remove: vi.fn(),
	show: vi.fn(),
}));

vi.mock("ez-modal-react", () => ({
	default: {
		create: <T,>(Component: T) => Component,
		show: mocks.show,
	},
}));

vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

const renderConfirmation = () => {
	const props = {
		title: "Delete proxy host",
		children: "Confirm host removal",
		onConfirm: mocks.onConfirm,
		invalidations: [["proxy-hosts"], ["host-report"]],
	};
	showDeleteConfirmModal(props);
	const Modal = mocks.show.mock.calls[0][0];
	return render(<Modal {...props} visible remove={mocks.remove} />);
};

describe("DeleteConfirmModal", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.onConfirm.mockResolvedValue(undefined);
		mocks.invalidateQueries.mockResolvedValue(undefined);
	});

	afterEach(cleanup);

	it("waits for all cache refreshes before closing and keeps actions disabled while pending", async () => {
		let finishRefresh!: () => void;
		mocks.invalidateQueries.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				finishRefresh = resolve;
			}),
		);
		renderConfirmation();
		fireEvent.click(screen.getByRole("button", { name: "Delete" }));
		await waitFor(() => expect(mocks.invalidateQueries).toHaveBeenCalledTimes(2));
		expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["proxy-hosts"] });
		expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["host-report"] });
		expect(screen.getByRole("button", { name: "..." })).toBeDisabled();
		expect(screen.getAllByRole("button", { name: "Close" })[0]).toBeDisabled();
		fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
		expect(mocks.remove).not.toHaveBeenCalled();
		await act(async () => finishRefresh());
		await waitFor(() => expect(mocks.remove).toHaveBeenCalledOnce());
		expect(mocks.onConfirm).toHaveBeenCalledOnce();
	});

	it("allows retrying a failed deletion", async () => {
		mocks.onConfirm.mockRejectedValueOnce(new Error("error.unknown"));
		renderConfirmation();
		fireEvent.click(screen.getByRole("button", { name: "Delete" }));
		expect(await screen.findByText("Unknown error")).toBeInTheDocument();
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
		fireEvent.click(screen.getByRole("button", { name: "Delete" }));
		await waitFor(() => expect(mocks.remove).toHaveBeenCalledOnce());
		expect(mocks.onConfirm).toHaveBeenCalledTimes(2);
	});

	it("surfaces refresh failure without allowing the successful deletion to run again", async () => {
		mocks.invalidateQueries.mockRejectedValueOnce(new Error("error.unknown"));
		renderConfirmation();
		fireEvent.click(screen.getByRole("button", { name: "Delete" }));
		expect(await screen.findByText("Unknown error")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
		fireEvent.click(screen.getByRole("button", { name: "Delete" }));
		expect(mocks.onConfirm).toHaveBeenCalledOnce();
		expect(mocks.remove).not.toHaveBeenCalled();
		fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
		expect(mocks.remove).toHaveBeenCalledOnce();
	});

	it("shows a fallback for a deletion rejection without an Error object", async () => {
		mocks.onConfirm.mockRejectedValueOnce(null);
		renderConfirmation();
		fireEvent.click(screen.getByRole("button", { name: "Delete" }));
		expect(await screen.findByText("Unknown error")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
	});
});
