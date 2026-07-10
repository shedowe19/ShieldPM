import { createIntl, createIntlCache } from "react-intl";
import langEn from "./lang/en.json";
import langList from "./lang/lang-list.json";

// first item of each array should be the language code,
// not the country code
// Remember when adding to this list, also update check-locales.js script
export type LocaleOption = [string, string];
type LocaleMessages = Record<string, string>;

const localeOptions: LocaleOption[] = [
	["en", "en-US"],
	["de", "de-DE"],
	["es", "es-ES"],
	["ja", "ja-JP"],
	["it", "it-IT"],
	["nl", "nl-NL"],
	["pl", "pl-PL"],
	["ru", "ru-RU"],
	["sk", "sk-SK"],
	["vi", "vi-VN"],
	["zh", "zh-CN"],
	["ko", "ko-KR"],
	["bg", "bg-BG"],
];

const localeLoaders: Record<string, () => Promise<{ default: LocaleMessages }>> = {
	bg: () => import("./lang/bg.json"),
	de: () => import("./lang/de.json"),
	es: () => import("./lang/es.json"),
	it: () => import("./lang/it.json"),
	ja: () => import("./lang/ja.json"),
	ko: () => import("./lang/ko.json"),
	nl: () => import("./lang/nl.json"),
	pl: () => import("./lang/pl.json"),
	ru: () => import("./lang/ru.json"),
	sk: () => import("./lang/sk.json"),
	vi: () => import("./lang/vi.json"),
	zh: () => import("./lang/zh.json"),
};

const mergeMessages = (messages: LocaleMessages): LocaleMessages => ({
	...langList,
	...langEn,
	...messages,
});

const loadMessages = async (locale?: string): Promise<LocaleMessages> => {
	const thisLocale = (locale || "en").slice(0, 2);
	const loadLocale = localeLoaders[thisLocale];

	if (!loadLocale) {
		return mergeMessages(langEn);
	}

	try {
		const { default: messages } = await loadLocale();
		return mergeMessages(messages);
	} catch {
		return mergeMessages(langEn);
	}
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
let intl = createIntl({ locale: getLocale(), messages: mergeMessages(langEn) }, cache);

const initializeLocale = async (): Promise<void> => {
	const locale = getLocale();
	intl = createIntl({ locale, messages: await loadMessages(locale) }, cache);
	document.documentElement.lang = locale;
};

const changeLocale = async (locale: string): Promise<void> => {
	intl = createIntl({ locale, messages: await loadMessages(locale) }, cache);
	window.localStorage.setItem("locale", locale);
	document.documentElement.lang = locale;
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

export {
	changeLocale,
	createIntl,
	getFlagCodeForLocale,
	getLocale,
	initializeLocale,
	intl,
	loadMessages,
	localeOptions,
	T,
};
