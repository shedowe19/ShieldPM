import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnalyticsRecentRequests } from "./AnalyticsRecentRequests";

afterEach(() => {
	cleanup();
});

describe("AnalyticsRecentRequests", () => {
	it("masks client IP addresses in demo mode without hiding request details", () => {
		render(
			<AnalyticsRecentRequests
				isDemo
				summary={{
					recentRequests: [
						{
							countryCode: "DE",
							duration: 42,
							ip: "198.51.100.42",
							method: "GET",
							path: "/health",
							status: 404,
							time: "2026-01-01T12:00:00Z",
						},
					],
				}}
			/>,
		);

		for (const header of ["Time", "Method", "Status", "Path", "IP Address", "Duration"]) {
			expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
		}
		expect(screen.getByText("GET")).toBeInTheDocument();
		expect(screen.getByText("404")).toHaveClass("text-yellow-500");
		expect(screen.getByText("/health")).toBeInTheDocument();
		expect(screen.getByRole("cell", { name: "Hidden IP (DE)" })).toBeInTheDocument();
		expect(screen.queryByText("198.51.100.42")).not.toBeInTheDocument();
		expect(screen.getByText("42ms")).toBeInTheDocument();
	});
});
