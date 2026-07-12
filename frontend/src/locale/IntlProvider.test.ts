import { afterEach, describe, expect, it } from "vitest";
import { initializeLocale, intl, loadMessages } from "./IntlProvider";

const initialDocumentLanguage = document.documentElement.lang;

afterEach(() => {
	window.localStorage.removeItem("locale");
	document.documentElement.lang = initialDocumentLanguage;
});

describe("loadMessages", () => {
	it("loads language options with their native names", async () => {
		const messages = await loadMessages("de-DE");

		expect(messages["action.add"]).toBe("Hinzufügen");
		expect(messages["locale-de-DE"]).toBe("Deutsch");
	});

	it("falls back to English for unsupported locales", async () => {
		const messages = await loadMessages("pt-BR");

		expect(messages["action.add"]).toBe("Add");
	});

	it("initializes the persisted locale before the application renders", async () => {
		window.localStorage.setItem("locale", "de-DE");

		await initializeLocale();

		expect(document.documentElement.lang).toBe("de-DE");
		expect(intl.formatMessage({ id: "action.add" })).toBe("Hinzufügen");
	});
});
