import { cleanup, render, screen } from "@testing-library/react";
import { lazy, Suspense } from "react";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { HelpContentBoundary } from "./HelpContentBoundary";

vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => id,
}));

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
const BrokenHelpContent = lazy(async () => {
	throw new Error("Help chunk failed to load");
});

describe("HelpContentBoundary", () => {
	afterEach(() => {
		cleanup();
	});

	afterAll(() => {
		consoleErrorSpy.mockRestore();
	});

	it("keeps a localized fallback visible when the help content chunk rejects", async () => {
		render(
			<HelpContentBoundary>
				<Suspense fallback={null}>
					<BrokenHelpContent />
				</Suspense>
			</HelpContentBoundary>,
		);

		expect(await screen.findByRole("alert")).toHaveTextContent("error.unknown");
	});
});
