import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Table from "./Table";

vi.mock("src/components", () => ({
	EventFormatter: () => null,
	UserAvatar: () => null,
}));

describe("Audit log table", () => {
	beforeEach(async () => {
		await changeLocale("de");
	});

	afterEach(async () => {
		cleanup();
		await changeLocale("en");
	});

	it("exposes an explicit localized name for each event details action", () => {
		const onSelectItem = vi.fn();
		render(
			<Table
				data={[
					{
						action: "updated",
						createdOn: "2026-07-12T00:00:00Z",
						id: 73,
						meta: {},
						modifiedOn: "2026-07-12T00:00:00Z",
						objectId: 11,
						objectType: "proxy-host",
						userId: 1,
					},
				]}
				onSelectItem={onSelectItem}
			/>,
		);

		const detailsButton = screen.getByRole("button", { name: "Details" });
		expect(detailsButton).toHaveAttribute("aria-label", "Details");

		fireEvent.click(detailsButton);
		expect(onSelectItem).toHaveBeenCalledWith(73);
	});
});
