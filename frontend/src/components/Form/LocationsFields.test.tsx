import { cleanup, render, screen } from "@testing-library/react";
import { changeLocale } from "src/locale";
import { FORWARD_SCHEME } from "src/types/enums";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocationsFields } from "./LocationsFields";

const mocks = vi.hoisted(() => ({
	setFieldValue: vi.fn(),
}));

vi.mock("formik", () => ({
	useFormikContext: () => ({ setFieldValue: mocks.setFieldValue }),
}));

describe("LocationsFields", () => {
	beforeEach(async () => {
		await changeLocale("de");
	});

	afterEach(async () => {
		cleanup();
		vi.clearAllMocks();
		await changeLocale("en");
	});

	it("gives the advanced settings toggle a localized accessible name", () => {
		render(
			<LocationsFields
				initialValues={[
					{
						path: "/app",
						advancedConfig: "",
						forwardQuery: "",
						forwardScheme: FORWARD_SCHEME.HTTP,
						forwardHost: "127.0.0.1",
						forwardPort: 3000,
					},
				]}
			/>,
		);

		const advancedSettingsButton = screen.getByRole("button", { name: "Erweiterte Einstellungen" });
		expect(advancedSettingsButton).toHaveAttribute("aria-label", "Erweiterte Einstellungen");
	});
});
