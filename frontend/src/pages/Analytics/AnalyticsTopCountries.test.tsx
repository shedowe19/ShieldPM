import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnalyticsTopCountries } from "./AnalyticsTopCountries";

afterEach(() => {
	cleanup();
});

describe("AnalyticsTopCountries", () => {
	it("renders every reported country with its request count", () => {
		render(
			<AnalyticsTopCountries
				summary={{
					topCountries: [
						{ countryCode: "DE", count: 24 },
						{ countryCode: "US", count: 12 },
					],
				}}
			/>,
		);

		expect(screen.getByRole("heading", { name: "Top Countries" })).toBeInTheDocument();
		expect(screen.getByText("DE")).toBeInTheDocument();
		expect(screen.getByText("US")).toBeInTheDocument();
		expect(screen.getByText("24")).toBeInTheDocument();
		expect(screen.getByText("12")).toBeInTheDocument();
	});

	it("keeps the localized empty state when no countries are reported", () => {
		render(<AnalyticsTopCountries summary={{ topCountries: [] }} />);

		expect(screen.getByText("No data to display")).toBeInTheDocument();
	});
});
