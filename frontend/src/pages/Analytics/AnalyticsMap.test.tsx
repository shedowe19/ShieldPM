import { act, cleanup, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsMap } from "./AnalyticsMap";

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

vi.mock("react-simple-maps", () => ({
	ComposableMap: ({ children }: PropsWithChildren) => <div data-testid="analytics-map">{children}</div>,
	Geographies: () => null,
	Geography: () => null,
	Marker: () => null,
	ZoomableGroup: ({ children }: PropsWithChildren) => <>{children}</>,
}));

describe("AnalyticsMap", () => {
	beforeEach(() => {
		observer.callback = undefined;
		observer.disconnect.mockClear();
		observer.observe.mockClear();
		vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
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
});
