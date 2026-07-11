import { cleanup, render, screen } from "@testing-library/react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BasicAuthFields } from "./BasicAuthFields";

const mocks = vi.hoisted(() => ({
	setFieldValue: vi.fn(),
}));

vi.mock("formik", () => ({
	useFormikContext: () => ({ setFieldValue: mocks.setFieldValue }),
}));

describe("BasicAuthFields", () => {
	beforeEach(async () => {
		await changeLocale("de");
	});

	afterEach(async () => {
		cleanup();
		vi.clearAllMocks();
		await changeLocale("en");
	});

	it("gives the destructive control a localized accessible name", () => {
		render(<BasicAuthFields initialValues={[{ username: "operator", password: "" }]} />);

		const deleteButton = screen.getByRole("button", { name: "Löschen" });
		expect(deleteButton).toHaveAttribute("aria-label", "Löschen");
	});
});
