import { cleanup, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import type { ButtonProps } from "src/components/ui/button";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	useDashboardNotes: vi.fn(),
}));

vi.mock("@tabler/icons-react", () => ({
	IconNote: () => null,
	IconPlus: () => null,
	IconTrash: () => null,
}));

vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("lucide-react", () => ({ Loader2: () => null }));
vi.mock("src/api/backend", () => ({ deleteDashboardNote: vi.fn() }));
vi.mock("src/hooks", () => ({ useDashboardNotes: mocks.useDashboardNotes }));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => <>{id}</>,
}));
vi.mock("src/notifications", () => ({ showObjectSuccess: vi.fn() }));
vi.mock("./lazy", () => ({ showDashboardNoteModal: vi.fn() }));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		size: _size,
		variant: _variant,
		...props
	}: ButtonProps) => <button {...props}>{children}</button>,
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
		mocks.invalidateQueries.mockClear();
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

		expect(
			screen.getByRole("button", { name: "dashboard.notes.add" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "action.edit Keep this note" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "action.delete Keep this note" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "action.edit Release checklist" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "action.delete Release checklist" }),
		).toBeInTheDocument();
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

		expect(
			editButton.compareDocumentPosition(deleteButton) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

		editButton.focus();
		expect(editButton).toHaveFocus();
		expect(actionContainer).toHaveClass("group-focus-within:opacity-100");

		deleteButton.focus();
		expect(deleteButton).toHaveFocus();
		expect(actionContainer).toHaveClass("group-focus-within:opacity-100");
	});
});
