import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => {
		if (id === "update-available") return "Update Available";
		return id;
	},
}));

describe("SiteFooter", () => {
	// Helper to setup mocks with different data
	const setup = (healthData: { version: string }, versionData: { updateAvailable: boolean; latest: string }) => {
		vi.mock("src/hooks", () => ({
			useHealth: () => ({
				data: healthData,
			}),
			useCheckVersion: () => ({
				data: versionData,
			}),
		}));
	};

	it("renders footer with version and repo links", async () => {
		setup({ version: "1.2.3" }, { updateAvailable: false, latest: "1.2.3" });

		// Need to re-import to apply new mocks if using doMock, but here we used top-level mock factory which is hoisted.
		// For dynamic mocking in Vitest, we often use vi.mocked() or factory with variable.
		// Let's use simple vi.mock with factory accessing variables if needed, OR verify basic static content first.
		// Actually, the previous example used vi.mock inside the test, which works in Vitest as it's hoisted?
		// No, `vi.mock` is hoisted to top of file.
		// To change mock per test, we should use `vi.doMock` and dynamic import, OR `mockReturnValue` if we mock the module instance.

		// Let's try the dynamic import approach used in the reference test.
		vi.resetModules();
		vi.doMock("src/hooks", () => ({
			useHealth: () => ({ data: { version: "1.2.3" } }),
			useCheckVersion: () => ({ data: { updateAvailable: false, latest: "1.2.3" } }),
		}));

		const { SiteFooter } = await import("./SiteFooter");

		render(<SiteFooter />);

		// Check for specific text
		expect(screen.queryByText("Fork me on Github")).not.toBeInTheDocument();
		expect(screen.getByText("1.2.3")).toBeInTheDocument();
		expect(screen.getByText("Powered by")).toBeInTheDocument();
		// Check for the explicit text "© 2026 ShieldPM. Private & Internal Use Only."
		// Note: Use a regex to match the copyright symbol or just partial text safely
		expect(screen.getByText(/2026 ShieldPM. Private & Internal Use Only/)).toBeInTheDocument();

		// Check "ShieldPM" link

		// Check "ShieldPM" link
		const shieldPmLink = screen.getByText("ShieldPM").closest("a");
		expect(shieldPmLink).toHaveAttribute("href", "https://github.com/shedowe19/ShieldPM");

		// Check Version link
		const versionLink = screen.getByText("1.2.3").closest("a");
		expect(versionLink).toHaveAttribute("href", "https://github.com/shedowe19/ShieldPM/releases/tag/v1.2.3");
	});

	it("renders update available link when update is available", async () => {
		vi.resetModules();
		vi.doMock("src/hooks", () => ({
			useHealth: () => ({ data: { version: "1.2.3" } }),
			useCheckVersion: () => ({ data: { updateAvailable: true, latest: "2.0.0" } }),
		}));

		const { SiteFooter } = await import("./SiteFooter");

		render(<SiteFooter />);

		// Check Update Available text
		expect(screen.getByText("Update Available")).toBeInTheDocument();

		// Check Update link
		const updateLink = screen.getByText("Update Available").closest("a");
		expect(updateLink).toHaveAttribute("href", "https://github.com/shedowe19/ShieldPM/releases/tag/v2.0.0");
	});
});
