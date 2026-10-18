import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Backups from "./Backups";

const mocks = vi.hoisted(() => ({ useInstanceBackups: vi.fn() }));
vi.mock("src/hooks/useInstanceBackups", () => mocks);
vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => id,
	intl: { formatMessage: ({ id }: { id: string }) => id },
}));

const id = "a1234567-1234-1234-1234-123456789abc";
const mutation = () => ({ mutate: vi.fn(), isPending: false, error: null });
let actions: ReturnType<typeof mutation>[];
let result: ReturnType<typeof mocks.useInstanceBackups>;
beforeEach(() => {
	actions = Array.from({ length: 7 }, mutation);
	result = {
		state: {
			data: {
				backups: [
					{
						id,
						name: "before upgrade",
						createdOn: "2026-10-17T00:00:00Z",
						size: 1024,
						database: "sqlite",
						appVersion: "4.4.1",
					},
				],
				jobs: [],
				pending: null,
				limits: { maxBytes: 8 * 1024 ** 3 },
			},
			error: null,
			isLoading: false,
		},
		create: actions[0],
		preflight: actions[1],
		restore: actions[2],
		cancel: actions[3],
		upload: actions[4],
		download: actions[5],
		remove: actions[6],
	};
	mocks.useInstanceBackups.mockReturnValue(result);
});
afterEach(cleanup);

describe("instance backup management", () => {
	it("makes deferred activation and password responsibility explicit before creating", () => {
		render(<Backups />);
		expect(screen.getByText("backups.restart-notice")).toBeInTheDocument();
		expect(screen.getByText("backups.password-notice")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "backups.create" })).toBeDisabled();
		fireEvent.change(screen.getByLabelText("backups.name"), { target: { value: "named backup" } });
		fireEvent.change(screen.getByLabelText("backups.password"), { target: { value: "long synthetic password" } });
		fireEvent.click(screen.getByRole("button", { name: "backups.create" }));
		expect(actions[0].mutate).toHaveBeenCalledWith(
			{ password: "long synthetic password", name: "named backup" },
			expect.any(Object),
		);
	});
	it("requires the exact selected archive confirmation before scheduling a restore", () => {
		render(<Backups />);
		fireEvent.click(screen.getByRole("button", { name: "backups.select" }));
		fireEvent.change(screen.getByLabelText("backups.restore-password"), {
			target: { value: "long synthetic password" },
		});
		const button = screen.getByRole("button", { name: "backups.schedule-restore" });
		expect(button).toBeDisabled();
		fireEvent.change(screen.getByLabelText("backups.confirmation"), {
			target: { value: "RESTORE another-backup" },
		});
		expect(button).toBeDisabled();
		fireEvent.change(screen.getByLabelText("backups.confirmation"), { target: { value: `RESTORE ${id}` } });
		fireEvent.click(button);
		expect(actions[2].mutate).toHaveBeenCalledWith(
			{ id, password: "long synthetic password", confirmation: `RESTORE ${id}` },
			expect.any(Object),
		);
	});
	it("allows an isolated verification without restore confirmation", () => {
		render(<Backups />);
		fireEvent.click(screen.getByRole("button", { name: "backups.select" }));
		fireEvent.change(screen.getByLabelText("backups.restore-password"), {
			target: { value: "long synthetic password" },
		});
		fireEvent.click(screen.getByRole("button", { name: "backups.verify" }));
		expect(actions[1].mutate).toHaveBeenCalledWith({ id, password: "long synthetic password" }, expect.any(Object));
		expect(actions[2].mutate).not.toHaveBeenCalled();
	});
	it("can cancel a pending next-restart restore and forbids another selection", () => {
		result.state.data.pending = { id, phase: "pending" };
		render(<Backups />);
		expect(screen.getByRole("button", { name: "backups.select" })).toBeDisabled();
		fireEvent.click(screen.getByRole("button", { name: "backups.cancel-pending" }));
		expect(actions[3].mutate).toHaveBeenCalled();
	});
	it("disables mutations during background work and when the catalog is unavailable", () => {
		result.state.data.jobs = [{ id: "job", kind: "create", phase: "snapshot", status: "running" }];
		const { rerender } = render(<Backups />);
		expect(screen.getByRole("button", { name: "backups.select" })).toBeDisabled();
		result.state.error = new Error("Catalog unavailable");
		rerender(<Backups />);
		expect(screen.getByRole("alert")).toHaveTextContent("Catalog unavailable");
		expect(screen.getByRole("button", { name: "backups.download" })).toBeDisabled();
	});
	it("downloads the chosen encrypted archive", () => {
		render(<Backups />);
		fireEvent.click(screen.getByRole("button", { name: "backups.download" }));
		expect(actions[5].mutate).toHaveBeenCalledWith(id);
	});
});
