import { cleanup, render, screen } from "@testing-library/react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";

describe("DialogContent", () => {
	beforeEach(async () => {
		await changeLocale("de");
	});

	afterEach(async () => {
		cleanup();
		await changeLocale("en");
	});

	it("localizes the close control for screen-reader users", () => {
		render(
			<Dialog open>
				<DialogContent>
					<DialogTitle>Testdialog</DialogTitle>
					<DialogDescription>Beschreibung des Testdialogs</DialogDescription>
				</DialogContent>
			</Dialog>,
		);

		expect(screen.getByRole("button", { name: "Schließen" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
	});
});
