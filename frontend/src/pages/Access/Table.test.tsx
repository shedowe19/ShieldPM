import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Table from "./Table";

vi.mock("src/components", () => ({
	EmptyData: () => null,
	HasPermission: ({ children }: { children?: React.ReactNode }) => children,
	UserAvatar: () => null,
	ValueWithDateFormatter: () => null,
}));

describe("Access table", () => {
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
						ownerUserId: 1,
						name: "Restricted",
						meta: {},
						satisfyAny: false,
						passAuth: false,
						items: [],
						clients: [],
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
