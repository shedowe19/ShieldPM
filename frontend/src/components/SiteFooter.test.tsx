import { cleanup, render, screen } from "@testing-library/react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteFooter } from "./SiteFooter";

const hooks = vi.hoisted(() => ({
	useCheckVersion: vi.fn(),
	useHealth: vi.fn(),
}));

vi.mock("src/hooks/useCheckVersion", () => ({
	useCheckVersion: hooks.useCheckVersion,
}));
vi.mock("src/hooks/useHealth", () => ({
	useHealth: hooks.useHealth,
}));

describe("SiteFooter", () => {
	beforeEach(async () => {
		await changeLocale("en");
		hooks.useHealth.mockReturnValue({ data: { demo: false, version: "1.2.3" } });
		hooks.useCheckVersion.mockReturnValue({ data: { latest: "1.2.3", updateAvailable: false } });
	});

	afterEach(() => {
		cleanup();
	});

	it("renders footer with version and protected external links", () => {
		render(<SiteFooter />);

		expect(screen.queryByText("Fork me on Github")).not.toBeInTheDocument();
		expect(screen.getByText("1.2.3")).toBeInTheDocument();
		expect(screen.getByText("Powered by")).toBeInTheDocument();
		expect(screen.getByText("Private & Internal Use Only")).toBeInTheDocument();

		const shieldPmLink = screen.getByText("ShieldPM").closest("a");
		expect(shieldPmLink).toHaveAttribute("href", "https://github.com/shedowe19/ShieldPM");
		const externalLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank");
		expect(externalLinks).toHaveLength(3);
		for (const externalLink of externalLinks) {
			expect(externalLink).toHaveAttribute("rel", "noopener noreferrer");
		}

		const versionLink = screen.getByText("1.2.3").closest("a");
		expect(versionLink).toHaveAttribute("href", "https://github.com/shedowe19/ShieldPM/releases/tag/v1.2.3");
	});

	it("localizes the footer status, attribution, and update title", async () => {
		await changeLocale("de");
		hooks.useHealth.mockReturnValue({ data: { demo: true, version: "1.2.3" } });
		hooks.useCheckVersion.mockReturnValue({ data: { latest: "2.0.0", updateAvailable: true } });

		render(<SiteFooter />);

		expect(screen.getByText("Bereitgestellt von")).toBeInTheDocument();
		expect(screen.getByText("Nur für private und interne Nutzung")).toBeInTheDocument();
		expect(screen.getByText("Design von")).toBeInTheDocument();
		expect(screen.getByText("DEMO-MODUS")).toBeInTheDocument();
		expect(screen.getByTitle("Neue Version 2.0.0 ist verfügbar")).toBeInTheDocument();
	});
});
