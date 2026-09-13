import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
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

		const map = screen.getByTestId("analytics-map-canvas");
		const wheel = createEvent.wheel(map, { deltaY: -100 });
		// Happy DOM does not currently copy mouse coordinates into WheelEvent.
		Object.defineProperties(wheel, { clientX: { value: 200 }, clientY: { value: 150 } });
		fireEvent(map, wheel);

		expect(screen.getByTestId("analytics-map-viewport")).toHaveAttribute(
			"transform",
			"translate(-40 -30) scale(1.2)",
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
	it("accounts for SVG margins when zooming and dragging in a wide container", () => {
		vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
			...mapBounds,
			width: 1200,
			right: 1200,
		});
		render(<AnalyticsMapContent summary={null} />);
		const map = screen.getByTestId("analytics-map-canvas");
		// 200 px of horizontal margin places the pointer at map position (100, 100).
		const wheel = createEvent.wheel(map, { deltaY: -100 });
		Object.defineProperties(wheel, { clientX: { value: 300 }, clientY: { value: 100 } });
		fireEvent(map, wheel);
		expect(screen.getByTestId("analytics-map-viewport")).toHaveAttribute(
			"transform",
			"translate(-20 -20) scale(1.2)",
		);
		fireEvent.pointerDown(map, { button: 0, clientX: 300, clientY: 100, pointerId: 1 });
		fireEvent.pointerMove(map, { clientX: 450, clientY: 150, pointerId: 1 });
		fireEvent.pointerUp(map, { clientX: 450, clientY: 150, pointerId: 1 });
		expect(screen.getByTestId("analytics-map-viewport")).toHaveAttribute(
			"transform",
			"translate(130 30) scale(1.2)",
		);
	});
});
