import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	useAccessLists: vi.fn(),
}));

vi.mock("src/api/backend", () => ({
	deleteAccessList: vi.fn(),
}));

vi.mock("src/components", () => ({
	HasPermission: ({ children }: { children?: ReactNode }) => children,
	LoadingPage: () => null,
}));

vi.mock("src/hooks", () => ({
	useAccessLists: mocks.useAccessLists,
}));

vi.mock("src/notifications", () => ({
	showObjectSuccess: vi.fn(),
}));

vi.mock("./lazy", () => ({
	showAccessListModal: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
	showHelpModal: vi.fn(),
}));

vi.mock("./Table", () => ({ default: () => null }));

describe("Access TableWrapper", () => {
	beforeEach(async () => {
		mocks.useAccessLists.mockReturnValue({
			data: [],
			isError: false,
			isFetching: false,
			isLoading: false,
		});
		await changeLocale("de");
	});

	afterEach(async () => {
		cleanup();
		vi.clearAllMocks();
		await changeLocale("en");
	});

	it("gives the help control a localized accessible name", async () => {
		const { default: TableWrapper } = await import("./TableWrapper");

		render(<TableWrapper />);

		const helpButton = screen.getByRole("button", { name: "Hilfe" });
		expect(helpButton).toHaveAttribute("aria-label", "Hilfe");
	});
});
