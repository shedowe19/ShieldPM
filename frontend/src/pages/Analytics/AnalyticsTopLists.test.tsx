import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnalyticsTopLists } from "./AnalyticsTopLists";

afterEach(() => {
	cleanup();
});

describe("AnalyticsTopLists", () => {
	it("keeps every top-list value visible while masking IP addresses in demo mode", () => {
		render(
			<AnalyticsTopLists
				isDemo
				summary={{
					topIps: [{ countryCode: "DE", count: 8, ip: "198.51.100.42" }],
					topPaths: [{ count: 6, path: "/status" }],
					topReferers: [{ count: 4, referer: "https://example.test/" }],
					topUserAgents: [{ count: 2, userAgent: "ShieldPM test agent" }],
				}}
			/>,
		);

		expect(screen.getByText("Hidden IP")).toBeInTheDocument();
		expect(screen.queryByText("198.51.100.42")).not.toBeInTheDocument();
		expect(screen.getByText("https://example.test/")).toBeInTheDocument();
		expect(screen.getByText("/status")).toBeInTheDocument();
		expect(screen.getByText("ShieldPM test agent")).toBeInTheDocument();
	});
});
