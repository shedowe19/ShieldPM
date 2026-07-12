import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsGeography } from "./AnalyticsGeography";

const mocks = vi.hoisted(() => ({
	renderMap: vi.fn(),
	renderTopCountries: vi.fn(),
}));

vi.mock("./AnalyticsMap", () => ({
	AnalyticsMap: ({ summary }: { summary: unknown }) => {
		mocks.renderMap(summary);
		return <div data-testid="analytics-map" />;
	},
}));

vi.mock("./AnalyticsTopCountries", () => ({
	AnalyticsTopCountries: ({ summary }: { summary: unknown }) => {
		mocks.renderTopCountries(summary);
		return <div data-testid="analytics-top-countries" />;
	},
}));

describe("AnalyticsGeography", () => {
	it("keeps the country map and top-country list together for the same summary", () => {
		const summary = { topCountries: [{ countryCode: "DE", count: 24 }] };

		render(<AnalyticsGeography summary={summary} />);

		expect(screen.getByRole("heading", { name: "Requests by Country" })).toBeInTheDocument();
		expect(screen.getByTestId("analytics-map")).toBeInTheDocument();
		expect(screen.getByTestId("analytics-top-countries")).toBeInTheDocument();
		expect(mocks.renderMap).toHaveBeenCalledWith(summary);
		expect(mocks.renderTopCountries).toHaveBeenCalledWith(summary);
	});
});
