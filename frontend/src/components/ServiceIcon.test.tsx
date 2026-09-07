import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

it("tries a newly selected icon after the previous URL failed", () => {
	const { rerender } = render(
		<ServiceIcon iconType={ICON_TYPE.CUSTOM} customIconUrl="https://example.test/missing.svg" />,
	);
	fireEvent.error(screen.getByRole("img"));
	rerender(<ServiceIcon iconType={ICON_TYPE.CUSTOM} customIconUrl="https://example.test/working.svg" />);
	expect(screen.getByRole("img")).toHaveAttribute("src", "https://example.test/working.svg");
	cleanup();
});
