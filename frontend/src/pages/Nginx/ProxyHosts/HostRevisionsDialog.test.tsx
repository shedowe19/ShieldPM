import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostRevisionsDialog } from "./HostRevisionsDialog";

const state = vi.hoisted(() => ({ plan: null as any, mutation: null as any, revisions: null as any }));
vi.mock("src/hooks/useHostRevisions", () => ({
	useHostRevisions: () => state.revisions,
	useHostRevisionPlan: () => state.plan,
	useRestoreHostRevision: () => state.mutation,
}));
vi.mock("src/components/HasPermission", () => ({ HasPermission: ({ children }: any) => children }));
vi.mock("src/locale", () => ({ T: ({ id }: any) => id, formatDateTime: (date: string) => date }));
vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children }: any) => children,
	DialogContent: ({ children }: any) => <div>{children}</div>,
	DialogDescription: ({ children }: any) => <p>{children}</p>,
	DialogFooter: ({ children }: any) => <footer>{children}</footer>,
	DialogHeader: ({ children }: any) => <header>{children}</header>,
	DialogTitle: ({ children }: any) => <h2>{children}</h2>,
}));
afterEach(cleanup);
beforeEach(() => {
	state.revisions = {
		isPending: false,
		error: null,
		data: [{ id: 7, hostId: 1, actorUserId: 1, createdOn: "2026-10-17", action: "updated" }],
	};
	state.plan = {
		isPending: false,
		isFetching: false,
		error: null,
		data: {
			expectedFingerprint: "a".repeat(64),
			changes: [{ field: "forward_host", before: "new.internal", after: "old.internal" }],
		},
	};
	state.mutation = { isPending: false, error: null, isSuccess: false, mutate: vi.fn(), reset: vi.fn() };
});
const show = () => render(<HostRevisionsDialog hostId={1} domain="example.test" onClose={vi.fn()} />);
const select = () => fireEvent.click(screen.getByRole("button", { name: /#7/ }));
describe("host revision review", () => {
	it("requires choosing a revision and then submits its reviewed fingerprint", () => {
		show();
		expect(screen.queryByRole("button", { name: "proxy-host.revisions.restore" })).not.toBeInTheDocument();
		select();
		expect(screen.getByText('"new.internal"')).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "proxy-host.revisions.restore" }));
		expect(state.mutation.mutate).toHaveBeenCalledWith({ revisionId: 7, fingerprint: "a".repeat(64) });
	});
	it("blocks restore when refreshing a possibly stale plan", () => {
		state.plan.isFetching = true;
		show();
		select();
		expect(screen.getByRole("button", { name: "proxy-host.revisions.restore" })).toBeDisabled();
	});
	it("does not offer cached restore data after plan validation fails", () => {
		state.plan.error = new Error("shared resource changed");
		show();
		select();
		expect(screen.getByText("shared resource changed")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "proxy-host.revisions.restore" })).not.toBeInTheDocument();
	});
	it("shows owner-scoped history errors and offers no mutation", () => {
		state.revisions.error = new Error("Not Found");
		show();
		expect(screen.getByText("Not Found")).toBeInTheDocument();
		expect(state.mutation.mutate).not.toHaveBeenCalled();
	});
});
