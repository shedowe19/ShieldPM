import { act, cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsMap } from "./AnalyticsMap";

const mocks = vi.hoisted(() => ({
	failMapContent: false,
}));

const observer = {
	callback: undefined as IntersectionObserverCallback | undefined,
	disconnect: vi.fn(),
	observe: vi.fn(),
};

class IntersectionObserverMock {
	constructor(callback: IntersectionObserverCallback) {
		observer.callback = callback;
	}

	disconnect = observer.disconnect;
	observe = observer.observe;
	unobserve = vi.fn();
}

vi.mock("./AnalyticsMapContent", () => ({
	default: () => {
		if (mocks.failMapContent) {
			throw new Error("Analytics map chunk failed");
		}

		return <div data-testid="analytics-map" />;
	},
}));

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

describe("AnalyticsMap", () => {
	beforeEach(() => {
		mocks.failMapContent = false;
		observer.callback = undefined;
		observer.disconnect.mockClear();
		observer.observe.mockClear();
		vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	afterAll(() => {
		consoleErrorSpy.mockRestore();
	});

	it("defers the map until its section is near the viewport while keeping a loading fallback", async () => {
		render(<AnalyticsMap summary={{ topCountries: [] }} />);

		expect(screen.getByText("Loading…")).toBeInTheDocument();
		expect(screen.queryByTestId("analytics-map")).not.toBeInTheDocument();
		expect(observer.observe).toHaveBeenCalledOnce();

		if (!observer.callback) {
			throw new Error("Intersection observer callback was not registered");
		}
		await act(async () => {
			observer.callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
		});

		expect(await screen.findByTestId("analytics-map")).toBeInTheDocument();
		expect(observer.disconnect).toHaveBeenCalledOnce();
	});

	it("contains a failed map chunk without replacing the surrounding analytics content", async () => {
		mocks.failMapContent = true;
		render(
			<>
				<p>Analytics content remains available</p>
				<AnalyticsMap summary={{ topCountries: [] }} />
			</>,
		);

		if (!observer.callback) {
			throw new Error("Intersection observer callback was not registered");
		}
		await act(async () => {
			observer.callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
		});

		expect(await screen.findByRole("alert")).toBeInTheDocument();
		expect(screen.getByText("Analytics content remains available")).toBeInTheDocument();
	});
});
