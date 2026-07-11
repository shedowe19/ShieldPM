import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnalyticsKpis } from "./AnalyticsKpis";

afterEach(() => {
	cleanup();
});

describe("AnalyticsKpis", () => {
	it("keeps the request, throughput, and database metrics visible", () => {
		render(
			<AnalyticsKpis
				dbStats={{
					connections: { max: 10, open: 3, used: 3 },
					engine: "sqlite",
					io: { reads: 4, writes: 5 },
					size: 2048,
				}}
				networkSpeed={3072}
				summary={{ count: 1250, status2xx: 1000 }}
			/>,
		);

		for (const name of ["Total Requests", "Success Rate", "Bandwidth (Live)", "Database"]) {
			expect(screen.getByRole("heading", { name })).toBeInTheDocument();
		}
		expect(screen.getByText(/1[,.]250/)).toBeInTheDocument();
		expect(screen.getByText("80.0%")).toBeInTheDocument();
		expect(screen.getByText("3 KB/s")).toBeInTheDocument();
		expect(screen.getByText("2 KB")).toBeInTheDocument();
		expect(screen.getByText((_, node) => node?.textContent === "SQLITE • 3 Connections")).toBeInTheDocument();
		expect(screen.getByText((_, node) => node?.textContent === "Reads: 4 • Writes: 5")).toBeInTheDocument();
	});
});
