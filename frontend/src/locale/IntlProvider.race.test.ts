import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.resetModules());
it("keeps the last selected locale when an earlier lazy language import finishes later", async () => {
	vi.resetModules();
	const locale = await import("./IntlProvider");
	const first = locale.changeLocale("de");
	const second = locale.changeLocale("en");
	await Promise.all([first, second]);
	expect(locale.intl.locale).toBe("en");
	expect(locale.getLocale()).toBe("en");
	expect(document.documentElement.lang).toBe("en");
});
