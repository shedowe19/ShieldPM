import { cleanup, render, screen } from "@testing-library/react";
import { lazy, Suspense } from "react";
import { changeLocale } from "src/locale";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

const ThrowingRoute = () => {
	throw new Error("Route render failed");
};

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

describe("RouteErrorBoundary", () => {
	beforeEach(async () => {
		await changeLocale("de");
	});

	afterEach(async () => {
		cleanup();
		await changeLocale("en");
	});

	afterAll(() => {
		consoleErrorSpy.mockRestore();
	});

	it("announces and focuses the localized fallback when a route render fails", () => {
		render(
			<RouteErrorBoundary>
				<ThrowingRoute />
			</RouteErrorBoundary>,
		);

		const heading = screen.getByRole("heading", { name: "Diese Seite konnte nicht geladen werden." });
		expect(screen.getByRole("alert")).toHaveTextContent("Lade die Seite neu und versuche es erneut.");
		expect(screen.getByRole("button", { name: "Seite neu laden" })).toBeInTheDocument();
		expect(heading).toHaveFocus();
	});

	it("contains a rejected lazy route behind the same fallback", async () => {
		const BrokenLazyRoute = lazy(async () => {
			throw new Error("Chunk could not be loaded");
		});

		render(
			<RouteErrorBoundary>
				<Suspense fallback={<p>Wird geladen</p>}>
					<BrokenLazyRoute />
				</Suspense>
			</RouteErrorBoundary>,
		);

		expect(
			await screen.findByRole("heading", { name: "Diese Seite konnte nicht geladen werden." }),
		).toBeInTheDocument();
	});
});
