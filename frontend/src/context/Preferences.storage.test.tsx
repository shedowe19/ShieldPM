import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { changeLocale, getLocale, initializeLocale } from "src/locale/IntlProvider";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeContext";

function Probe() {
	const { theme, toggleTheme } = useTheme();
	return (
		<button type="button" onClick={toggleTheme}>
			{theme}
		</button>
	);
}
let storageDescriptor: PropertyDescriptor | undefined;
beforeEach(() => {
	storageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
});
afterEach(async () => {
	if (storageDescriptor) Object.defineProperty(window, "localStorage", storageDescriptor);
	cleanup();
	vi.restoreAllMocks();
	await changeLocale("en-US");
});
it("mounts locale and theme with browser defaults when accessing localStorage throws", async () => {
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		get: () => {
			throw new DOMException("Blocked", "SecurityError");
		},
	});
	await expect(initializeLocale()).resolves.toBeUndefined();
	render(
		<ThemeProvider>
			<Probe />
		</ThemeProvider>,
	);
	const button = screen.getByRole("button");
	const first = button.textContent;
	fireEvent.click(button);
	expect(button.textContent).not.toBe(first);
	expect(document.body.dataset.theme).toBe(button.textContent);
	await changeLocale("de-DE");
	expect(getLocale()).toBe("de-DE");
	expect(document.documentElement.lang).toBe("de-DE");
});
it("keeps a selected locale in memory when writes fail but reads remain available", async () => {
	vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
		throw new DOMException("Full", "QuotaExceededError");
	});
	await changeLocale("ja-JP");
	expect(getLocale()).toBe("ja-JP");
	await expect(initializeLocale()).resolves.toBeUndefined();
	expect(document.documentElement.lang).toBe("ja-JP");
});
