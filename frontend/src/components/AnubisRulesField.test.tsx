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

	it("uses localized German text for rule fields and challenge settings", () => {
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

		expect(screen.getByRole("heading", { name: "Anubis-Regeln" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Regel hinzufügen" })).toBeInTheDocument();
		expect(screen.getByPlaceholderText("Regelname (optional)")).toBeInTheDocument();
		expect(screen.getByPlaceholderText("Pfad-Regex (z. B. .*)")).toBeInTheDocument();
		expect(screen.getByPlaceholderText("User-Agent-Regex (optional)")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Erweiterte Einstellungen" }));

		expect(screen.getByText("Remote-Adressen (CIDR, kommagetrennt)")).toBeInTheDocument();
		expect(screen.getByText("Prüfschwierigkeit (1–16)")).toBeInTheDocument();
		expect(screen.getByText("Prüfalgorithmus")).toBeInTheDocument();
		expect(screen.getByPlaceholderText("Standard: 4")).toBeInTheDocument();
	});
});

it("keeps a rule path focused while typing and accepts comma-separated addresses incrementally", async () => {
	await changeLocale("en");
	render(
		<Formik
			initialValues={{ anubisRules: [{ action: "CHALLENGE", path: "/", remoteAddresses: [] }] }}
			onSubmit={() => {}}
		>
			<Form>
				<AnubisRulesField />
			</Form>
		</Formik>,
	);
	const path = screen.getByDisplayValue("/");
	path.focus();
	fireEvent.change(path, { target: { value: "/a" } });
	expect(screen.getByDisplayValue("/a")).toBe(path);
	expect(path).toHaveFocus();
	fireEvent.click(screen.getByRole("button", { name: "Advanced settings" }));
	const addresses = screen.getAllByRole("textbox")[3];
	fireEvent.change(addresses, { target: { value: "192.0.2.1," } });
	expect(addresses).toHaveValue("192.0.2.1, ");
	fireEvent.change(addresses, { target: { value: "192.0.2.1, 198.51.100.1" } });
	fireEvent.blur(addresses);
	expect(addresses).toHaveValue("192.0.2.1, 198.51.100.1");
	cleanup();
});
