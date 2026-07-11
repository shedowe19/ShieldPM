import { cleanup, render, screen } from "@testing-library/react";
import { changeLocale } from "src/locale";
import { ICON_TYPE } from "src/types/enums";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ServiceIcon } from "./ServiceIcon";

describe("ServiceIcon", () => {
	beforeEach(async () => {
		await changeLocale("de");
	});

	afterEach(async () => {
		cleanup();
		await changeLocale("en");
	});

	it("localizes the generic fallback label for assistive technologies", () => {
		render(<ServiceIcon />);

		expect(screen.getByLabelText("Dienstsymbol")).toBeInTheDocument();
	});

	it("localizes the custom icon alternative text", () => {
		render(<ServiceIcon iconType={ICON_TYPE.CUSTOM} customIconUrl="https://example.invalid/custom-icon.svg" />);

		expect(screen.getByAltText("Eigenes Symbol")).toBeInTheDocument();
	});
});
