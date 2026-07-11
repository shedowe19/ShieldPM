import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { AccessList } from "src/api/backend";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessListFormatter } from "./AccessListformatter";

const mocks = vi.hoisted(() => ({
	onEdit: vi.fn(),
	showAccessListModal: vi.fn(),
}));

vi.mock("src/modals/lazy", () => ({ showAccessListModal: mocks.showAccessListModal }));

const requireAccessListEditHandler = (
	props: ComponentProps<typeof AccessListFormatter>,
): { access?: AccessList; onEdit: (id: number) => void } => props;
void requireAccessListEditHandler;

describe("AccessListFormatter", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("delegates editing to the table-specific access list handler", () => {
		const access = { id: 73, name: "Restricted" } as AccessList;

		render(<AccessListFormatter access={access} onEdit={mocks.onEdit} />);
		fireEvent.click(screen.getByRole("button", { name: "Restricted" }));

		expect(mocks.onEdit).toHaveBeenCalledWith(73);
		expect(mocks.showAccessListModal).not.toHaveBeenCalled();
	});

	it("preserves the modal's zero ID fallback when the access list has no ID", () => {
		const access = { name: "Restricted" } as AccessList;

		render(<AccessListFormatter access={access} onEdit={mocks.onEdit} />);
		fireEvent.click(screen.getByRole("button", { name: "Restricted" }));

		expect(mocks.onEdit).toHaveBeenCalledWith(0);
	});
});
