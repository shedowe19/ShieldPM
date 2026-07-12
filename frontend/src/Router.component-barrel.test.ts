import { describe, expect, it, vi } from "vitest";

vi.mock("src/components", () => {
	throw new Error("Router must not import the shared component barrel");
});

vi.mock("src/components/AnimatedPage", () => ({ AnimatedPage: () => null }));
vi.mock("src/components/ErrorNotFound", () => ({ ErrorNotFound: () => null }));
vi.mock("src/components/LoadingPage", () => ({ LoadingPage: () => null }));
vi.mock("src/components/Page", () => ({ Page: () => null }));
vi.mock("src/components/Sidebar", () => ({ Sidebar: () => null }));
vi.mock("src/components/SiteContainer", () => ({ SiteContainer: () => null }));
vi.mock("src/components/SiteFooter", () => ({ SiteFooter: () => null }));
vi.mock("src/components/SiteHeader", () => ({ SiteHeader: () => null }));
vi.mock("src/components/Unhealthy", () => ({ Unhealthy: () => null }));
vi.mock("src/context", () => ({ useAuthState: () => ({ authenticated: false }) }));
vi.mock("src/hooks/useHealth", () => ({ useHealth: () => ({ isLoading: true }) }));

describe("Router component dependencies", () => {
	it("loads without importing the shared component barrel", async () => {
		await expect(import("./Router")).resolves.toHaveProperty("default");
	});
});
