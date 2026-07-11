import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Form, Formik } from "formik";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import AnubisRulesField from "./AnubisRulesField";

describe("AnubisRulesField", () => {
	beforeEach(async () => {
		await changeLocale("de");
	});

	afterEach(async () => {
		cleanup();
		await changeLocale("en");
	});

	it("gives nested rule controls localized accessible names and exposes the expanded state", () => {
		render(
			<Formik
				initialValues={{
					anubisRules: [
						{
							action: "CHALLENGE" as const,
							name: "Challenge bots",
							path: ".*",
						},
					],
				}}
				onSubmit={() => {}}
			>
				<Form>
					<AnubisRulesField />
				</Form>
			</Formik>,
		);

		const advancedSettingsButton = screen.getByRole("button", { name: "Erweiterte Einstellungen" });
		expect(advancedSettingsButton).toHaveAttribute("aria-expanded", "false");
		expect(screen.getByRole("button", { name: "Löschen" })).toHaveAttribute("aria-label", "Löschen");

		fireEvent.click(advancedSettingsButton);

		expect(advancedSettingsButton).toHaveAttribute("aria-expanded", "true");
	});
});
