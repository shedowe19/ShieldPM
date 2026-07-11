import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	failChartImport: false,
}));

vi.mock("./AnalyticsChartContent", () => {
	if (mocks.failChartImport) {
		throw new Error("Analytics chart chunk failed");
	}
	return { default: () => <div>Chart content</div> };
});

import { AnalyticsCharts } from "./AnalyticsCharts";

const observers: Array<{ callback: IntersectionObserverCallback }> = [];
class IntersectionObserverMock {
	callback: IntersectionObserverCallback;

	constructor(callback: IntersectionObserverCallback) {
		this.callback = callback;
		observers.push(this);
	}

	disconnect = vi.fn();
	observe = vi.fn();
	unobserve = vi.fn();
}

describe("AnalyticsCharts", () => {
	beforeEach(() => {
		mocks.failChartImport = false;
		observers.length = 0;
		vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("shows a recoverable localized fallback when the chart chunk fails", async () => {
		mocks.failChartImport = true;
		vi.spyOn(console, "error").mockImplementation(() => {});
		const reloadSpy = vi.spyOn(window.location, "reload").mockImplementation(() => {});

		render(<AnalyticsCharts series={[]} />);

		await act(async () => {
			for (const observer of observers) {
				observer.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
			}
		});

		expect(await screen.findByRole("alert")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button"));
		expect(reloadSpy).toHaveBeenCalledOnce();
	});
});
