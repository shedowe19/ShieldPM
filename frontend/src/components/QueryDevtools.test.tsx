import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query-devtools", () => ({
	ReactQueryDevtools: ({ buttonPosition, position }: { buttonPosition: string; position: string }) => (
		<div data-button-position={buttonPosition} data-position={position} data-testid="react-query-devtools" />
	),
}));

describe("QueryDevtools", () => {
	it("loads the development-only devtools with the existing placement", async () => {
		const { QueryDevtools } = await import("./QueryDevtools");

		render(<QueryDevtools />);

		const devtools = await screen.findByTestId("react-query-devtools");
		expect(devtools).toHaveAttribute("data-button-position", "bottom-right");
		expect(devtools).toHaveAttribute("data-position", "right");
	});
});
