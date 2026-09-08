import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import type { ButtonProps } from "src/components/ui/button";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	deleteNote: vi.fn(),
	showError: vi.fn(),
	showObjectSuccess: vi.fn(),
	useDashboardNotes: vi.fn(),
	permission: "manage",
}));

vi.mock("@tabler/icons-react", () => ({
	IconNote: () => null,
	IconPlus: () => null,
	IconTrash: () => null,
}));

vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("src/hooks/useUser", () => ({
	useUser: () => ({ data: { permissions: { dashboardNotes: mocks.permission }, roles: ["user"] }, isLoading: false }),
}));
vi.mock("lucide-react", () => ({ AlertCircle: () => null, Loader2: () => null }));
vi.mock("src/api/backend", () => ({ deleteDashboardNote: mocks.deleteNote }));
vi.mock("src/hooks/useDashboardNotes", () => ({ useDashboardNotes: mocks.useDashboardNotes }));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => <>{id}</>,
}));
vi.mock("src/notifications", () => ({ showObjectSuccess: mocks.showObjectSuccess, showError: mocks.showError }));
vi.mock("./lazy", () => ({ showDashboardNoteModal: vi.fn() }));

vi.mock("src/components/ui/button", () => ({
	Button: ({ children, size: _size, variant: _variant, ...props }: ButtonProps) => (
		<button {...props}>{children}</button>
	),
}));

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: PropsWithChildren) => <div>{children}</div>,
	CardContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	CardHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
	CardTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));

describe("DashboardNotesWidget", () => {
	afterEach(cleanup);

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.permission = "manage";
		mocks.useDashboardNotes.mockReturnValue({
			data: [
				{ id: 1, color: "yellow", content: "Keep this note" },
				{ id: 2, color: "blue", content: "Release checklist" },
			],
			isLoading: false,
		});
	});

	it("exposes localized and contextual names for dashboard note controls", async () => {
		const { DashboardNotesWidget } = await import("./DashboardNotesWidget");

		render(<DashboardNotesWidget />);

		expect(screen.getByRole("button", { name: "dashboard.notes.add" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "action.edit Keep this note" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "action.delete Keep this note" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "action.edit Release checklist" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "action.delete Release checklist" })).toBeInTheDocument();
	});

	it("keeps delete controls visible while note actions have keyboard focus", async () => {
		const { DashboardNotesWidget } = await import("./DashboardNotesWidget");

		render(<DashboardNotesWidget />);

		const editButton = screen.getByRole("button", {
			name: "action.edit Keep this note",
		});
		const deleteButton = screen.getByRole("button", {
			name: "action.delete Keep this note",
		});
		const actionContainer = deleteButton.parentElement;

		if (!actionContainer) {
			throw new Error("Dashboard note delete action is missing its container");
		}

		expect(editButton.compareDocumentPosition(deleteButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);

		editButton.focus();
		expect(editButton).toHaveFocus();
		expect(actionContainer).toHaveClass("group-focus-within:opacity-100");

		deleteButton.focus();
		expect(deleteButton).toHaveFocus();
		expect(actionContainer).toHaveClass("group-focus-within:opacity-100");
	});

	it("shows notes without editing controls for read-only users", async () => {
		mocks.permission = "view";
		const { DashboardNotesWidget } = await import("./DashboardNotesWidget");
		render(<DashboardNotesWidget />);
		expect(screen.getByText("Keep this note")).toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("does not request notes without view permission", async () => {
		mocks.permission = "hidden";
		const { DashboardNotesWidget } = await import("./DashboardNotesWidget");
		render(<DashboardNotesWidget />);
		expect(mocks.useDashboardNotes).not.toHaveBeenCalled();
		expect(screen.queryByText("dashboard.notes.title")).not.toBeInTheDocument();
	});

	it("reports a failed query without showing a false empty state", async () => {
		mocks.useDashboardNotes.mockReturnValue({ error: new Error("Notes unavailable"), isLoading: false });
		const { DashboardNotesWidget } = await import("./DashboardNotesWidget");
		render(<DashboardNotesWidget />);
		expect(screen.getByRole("alert")).toHaveTextContent("Notes unavailable");
		expect(screen.queryByText("dashboard.notes.empty")).not.toBeInTheDocument();
	});

	it("reports a failed deletion without a false success or invalidation", async () => {
		const { DashboardNotesWidget } = await import("./DashboardNotesWidget");
		vi.stubGlobal(
			"confirm",
			vi.fn(() => true),
		);
		mocks.deleteNote.mockRejectedValue(new Error("Deletion failed"));
		render(<DashboardNotesWidget />);
		fireEvent.click(screen.getByRole("button", { name: "action.delete Keep this note" }));
		await waitFor(() => expect(mocks.showError).toHaveBeenCalledWith("Deletion failed"));
		expect(mocks.showObjectSuccess).not.toHaveBeenCalled();
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});
});
