import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AnalyticsMapContent from "./AnalyticsMapContent";

const mapBounds = {
	bottom: 600,
	height: 600,
	left: 0,
	right: 800,
	top: 0,
	width: 800,
	x: 0,
	y: 0,
	toJSON: () => ({}),
};

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("AnalyticsMapContent", () => {
	it("renders locally bundled country geometry and highlights analytics markers", () => {
		render(<AnalyticsMapContent summary={{ topCountries: [{ countryCode: "DE", count: 42 }] }} />);

		expect(screen.getByTestId("analytics-map-canvas")).toHaveAttribute("viewBox", "0 0 800 600");
		const marker = screen.getByTestId("analytics-map-marker-DE");
		expect(marker).toBeInTheDocument();
		expect(marker.querySelector("title")).toHaveTextContent("Germany: 42");
	});

	it("keeps wheel zoom centered on the pointer position", () => {
		vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(mapBounds);
		render(<AnalyticsMapContent summary={null} />);

		fireEvent.wheel(screen.getByTestId("analytics-map-canvas"), { clientX: 400, clientY: 300, deltaY: -100 });

		expect(screen.getByTestId("analytics-map-viewport")).toHaveAttribute(
			"transform",
			"translate(-80 -60) scale(1.2)",
		);
	});

	it("supports dragging the map viewport", () => {
		vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(mapBounds);
		render(<AnalyticsMapContent summary={null} />);
		const map = screen.getByTestId("analytics-map-canvas");

		fireEvent.pointerDown(map, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
		fireEvent.pointerMove(map, { clientX: 200, clientY: 150, pointerId: 1 });
		fireEvent.pointerUp(map, { clientX: 200, clientY: 150, pointerId: 1 });

		expect(screen.getByTestId("analytics-map-viewport")).toHaveAttribute("transform", "translate(100 50) scale(1)");
	});
});
