import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AnalyticsMapContent from "./AnalyticsMapContent";

describe("AnalyticsMapContent", () => {
	it("renders the bundled world geometry and keeps map zoom and reset interactions local", () => {
		render(<AnalyticsMapContent summary={{ topCountries: [{ countryCode: "DE", count: 24 }] }} />);

		const map = screen.getByTestId("analytics-world-map");
		expect(map).toHaveAttribute("viewBox", "0 0 800 600");
		expect([...map.querySelectorAll("title")].map((title) => title.textContent)).toContain("Germany: 24");

		fireEvent.wheel(map, { clientX: 400, clientY: 300, deltaY: -100 });
		expect(map).not.toHaveAttribute("viewBox", "0 0 800 600");

		fireEvent.doubleClick(map);
		expect(map).toHaveAttribute("viewBox", "0 0 800 600");
	});
});
