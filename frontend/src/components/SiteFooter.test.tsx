import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteFooter } from "./SiteFooter";

const { mockHealthData, mockVersionData } = vi.hoisted(() => ({
	mockHealthData: vi.fn(),
	mockVersionData: vi.fn(),
}));

// Mock dependencies
vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => {
		if (id === "update-available") return "Update Available";
		return id;
	},
}));

vi.mock("src/hooks", () => ({
	useHealth: () => ({ data: mockHealthData() }),
	useCheckVersion: () => ({ data: mockVersionData() }),
}));

describe("SiteFooter", () => {
	beforeEach(() => {
		mockHealthData.mockReturnValue({ version: "1.2.3" });
		mockVersionData.mockReturnValue({ updateAvailable: false, latest: "1.2.3" });
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("renders footer with version and repo links", () => {
		render(<SiteFooter />);

		expect(screen.queryByText("Fork me on Github")).not.toBeInTheDocument();
		expect(screen.getByText("1.2.3")).toBeInTheDocument();
		expect(screen.getByText("Powered by")).toBeInTheDocument();
		expect(screen.getByText(/2026 ShieldPM. Private & Internal Use Only/)).toBeInTheDocument();

		const shieldPmLink = screen.getByText("ShieldPM").closest("a");
		expect(shieldPmLink).toHaveAttribute("href", "https://github.com/shedowe19/ShieldPM");

		const versionLink = screen.getByText("1.2.3").closest("a");
		expect(versionLink).toHaveAttribute("href", "https://github.com/shedowe19/ShieldPM/releases/tag/v1.2.3");
	});

	it("renders update available link when update is available", () => {
		mockVersionData.mockReturnValue({ updateAvailable: true, latest: "2.0.0" });

		render(<SiteFooter />);

		expect(screen.getByText("Update Available")).toBeInTheDocument();

		const updateLink = screen.getByText("Update Available").closest("a");
		expect(updateLink).toHaveAttribute("href", "https://github.com/shedowe19/ShieldPM/releases/tag/v2.0.0");
	});
});
