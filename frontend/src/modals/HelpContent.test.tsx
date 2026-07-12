import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HelpContent } from "./HelpContent";

const mocks = vi.hoisted(() => ({
	getHelpFile: vi.fn(),
	getLocale: vi.fn(),
}));

vi.mock("src/locale", () => ({
	getLocale: mocks.getLocale,
	T: ({ id }: { id: string }) => id,
}));
vi.mock("src/locale/HelpDoc", () => ({ getHelpFile: mocks.getHelpFile }));

describe("HelpContent", () => {
	beforeEach(() => {
		mocks.getLocale.mockReturnValue("en");
		mocks.getHelpFile.mockImplementation((_lang: string, section: string) => `/help/${section}.md`);
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("## Certificate help") }),
		);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		vi.unstubAllGlobals();
	});

	it("loads and renders the selected localized help document", async () => {
		render(<HelpContent section="Certificates" />);

		expect(mocks.getHelpFile).toHaveBeenCalledWith("en", "Certificates");
		expect(await screen.findByRole("heading", { level: 2, name: "Certificate help" })).toBeInTheDocument();
	});

	it.each([
		["network request rejects", vi.fn().mockRejectedValue(new Error("offline"))],
		["HTTP response fails", vi.fn().mockResolvedValue({ ok: false, text: () => Promise.resolve("") })],
	])("renders a localized fallback when the %s", async (_scenario, fetchMock) => {
		vi.stubGlobal("fetch", fetchMock);

		render(<HelpContent section="Certificates" />);

		expect(await screen.findByRole("alert")).toHaveTextContent("error.unknown");
	});

	it("ignores a stale document response after the selected section changes", async () => {
		type HelpResponse = { ok: boolean; text: () => Promise<string> };
		let resolveFirstResponse = (_response: HelpResponse) => {};
		let resolveSecondResponse = (_response: HelpResponse) => {};
		const firstResponse = new Promise<{ ok: boolean; text: () => Promise<string> }>((resolve) => {
			resolveFirstResponse = resolve;
		});
		const secondResponse = new Promise<{ ok: boolean; text: () => Promise<string> }>((resolve) => {
			resolveSecondResponse = resolve;
		});
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockImplementationOnce(() => firstResponse)
				.mockImplementationOnce(() => secondResponse),
		);

		const { rerender } = render(<HelpContent section="Certificates" />);
		rerender(<HelpContent section="ProxyHosts" />);
		resolveSecondResponse({ ok: true, text: () => Promise.resolve("## Proxy host help") });

		expect(await screen.findByRole("heading", { level: 2, name: "Proxy host help" })).toBeInTheDocument();

		resolveFirstResponse({ ok: true, text: () => Promise.resolve("## Certificate help") });

		await new Promise((resolve) => setTimeout(resolve, 0));
		await waitFor(() => {
			expect(screen.getByRole("heading", { level: 2, name: "Proxy host help" })).toBeInTheDocument();
		});
	});
});
