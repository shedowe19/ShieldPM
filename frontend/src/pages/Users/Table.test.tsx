import { cleanup, render, screen } from "@testing-library/react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Table from "./Table";

vi.mock("src/components", () => ({
	EmailFormatter: () => null,
	EmptyData: () => null,
	RolesFormatter: () => null,
	TrueFalseFormatter: () => null,
	UserAvatar: () => null,
	ValueWithDateFormatter: () => null,
}));

describe("Users table", () => {
	beforeEach(async () => {
		await changeLocale("de");
	});

	afterEach(async () => {
		cleanup();
		await changeLocale("en");
	});

	it("gives each row action menu an explicit localized accessible name", () => {
		render(
			<Table
				data={[
					{
						id: 1,
						createdOn: "2026-01-01T00:00:00Z",
						modifiedOn: "2026-01-01T00:00:00Z",
						isDisabled: false,
						email: "operator@example.test",
						name: "Operator",
						nickname: "operator",
						avatar: "",
						avatar_type: "upload",
						avatar_value: null,
						roles: ["admin"],
					},
				]}
			/>,
		);

		expect(screen.getByRole("button", { name: "Aktionsmenü öffnen" })).toHaveAttribute(
			"aria-label",
			"Aktionsmenü öffnen",
		);
	});
});
