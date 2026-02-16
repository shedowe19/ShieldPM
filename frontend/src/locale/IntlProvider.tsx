import { createIntl, createIntlCache } from "react-intl";
import langEn from "./lang/en.json";
import langList from "./lang/lang-list.json";

// Force HMR reload

// first item of each array should be the language code,
// not the country code
// Remember when adding to this list, also update check-locales.js script
export type LocaleOption = [string, string, () => Promise<any>];
const localeOptions: LocaleOption[] = [
	["en", "en-US", () => import("./lang/en.json")],
	["de", "de-DE", () => import("./lang/de.json")],
	["es", "es-ES", () => import("./lang/es.json")],
	["ja", "ja-JP", () => import("./lang/ja.json")],
	["it", "it-IT", () => import("./lang/it.json")],
	["nl", "nl-NL", () => import("./lang/nl.json")],
	["pl", "pl-PL", () => import("./lang/pl.json")],
	["ru", "ru-RU", () => import("./lang/ru.json")],
	["sk", "sk-SK", () => import("./lang/sk.json")],
	["vi", "vi-VN", () => import("./lang/vi.json")],
	["zh", "zh-CN", () => import("./lang/zh.json")],
	["ko", "ko-KR", () => import("./lang/ko.json")],
	["bg", "bg-BG", () => import("./lang/bg.json")],
];

const loadMessages = async (locale?: string): Promise<typeof langList & typeof langEn> => {
	const thisLocale = (locale || "en").slice(0, 2);

	// find language
	const found = localeOptions.find(([code]) => code === thisLocale);
	let messages = langEn;

	if (found) {
		const module = await found[2]();
		messages = module.default || module;
	}

	return Object.assign({}, langList, langEn, messages);
};

const getFlagCodeForLocale = (locale?: string) => {
	const thisLocale = (locale || "en").slice(0, 2);

	// only add to this if your flag is different from the locale code
	const specialCases: Record<string, string> = {
		ja: "jp", // Japan
		zh: "cn", // China
		vi: "vn", // Vietnam
		ko: "kr", // Korea
		en: "gb", // English (UK)
	};

	if (specialCases[thisLocale]) {
		return specialCases[thisLocale].toUpperCase();
	}
	return thisLocale.toUpperCase();
};

const getLocale = (short = false) => {
	let loc = window.localStorage.getItem("locale");
	if (!loc) {
		loc = navigator.language || navigator.languages?.[0] || document.documentElement.lang;
	}
	if (short) {
		return loc ? loc.slice(0, 2) : "en";
	}
	// finally, fallback
	if (!loc) {
		loc = "en";
	}
	return loc;
};

const cache = createIntlCache();

// Initial load is synchronous to prevent flash of content, but defaults to EN if others not loaded
// In a real lazy load scenario, we might want to start with a loader or EN.
// For now, we initialize with English and let the app trigger a reload if needed.
const initialMessages = Object.assign({}, langList, langEn);
let intl = createIntl({ locale: getLocale(), messages: initialMessages }, cache);

const changeLocale = async (locale: string): Promise<void> => {
	const messages = await loadMessages(locale);
	intl = createIntl({ locale, messages }, cache);
	window.localStorage.setItem("locale", locale);
	document.documentElement.lang = locale;
	// Trigger a reload or state update to refresh the UI
	// This part is tricky because intl is a singleton here.
	// The LocaleProvider context usually handles the re-render.
	// We might need to dispatch an event or rely on the Context to call this and update state.
};

// This is a translation component that wraps the translation in a span with a data
// attribute so devs can inspect the element to see the translation ID
const T = ({
	id,
	data,
	tData,
}: {
	id: string;
	data?: Record<string, string | number | undefined>;
	tData?: Record<string, string>;
}) => {
	const translatedData: Record<string, string> = {};
	if (tData) {
		// iterate over tData and translate each value
		Object.entries(tData).forEach(([key, value]) => {
			translatedData[key] = intl.formatMessage({ id: value });
		});
	}
	return (
		<span data-translation-id={id}>
			{intl.formatMessage(
				{ id },
				{
					...data,
					...translatedData,
				},
			)}
		</span>
	);
};

export { localeOptions, getFlagCodeForLocale, getLocale, createIntl, changeLocale, intl, T, loadMessages };
