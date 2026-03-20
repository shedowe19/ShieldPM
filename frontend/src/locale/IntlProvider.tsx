import { createIntl, createIntlCache } from "react-intl";
import langEn from "./lang/en.json";
import langList from "./lang/lang-list.json";

export type LocaleOption = [string, string];
export const localeOptions: LocaleOption[] = [
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

const localeLoaders = import.meta.glob<Record<string, string>>("./lang/*.json", { import: "default" });

const getLocale = (short = false) => {
	let loc = window.localStorage.getItem("locale");
	if (!loc) {
		loc = navigator.language || navigator.languages?.[0] || document.documentElement.lang;
	}
	if (short) {
		return loc ? loc.slice(0, 2) : "en";
	}
	if (!loc) {
		loc = "en";
	}
	return loc;
};

const getLocaleMessages = async (locale?: string) => {
	const thisLocale = (locale || "en").slice(0, 2);
	const normalizedLocale = localeOptions.find(([code]) => code === thisLocale)?.[0] || "en";
	const englishMessages = langEn as Record<string, string>;
	const localeMessages = normalizedLocale === "en" ? englishMessages : ((await localeLoaders[`./lang/${normalizedLocale}.json`]()) || {}) as Record<string, string>;

	return Object.assign({}, langList, englishMessages, localeMessages);
};

const getFlagCodeForLocale = (locale?: string) => {
	const thisLocale = (locale || "en").slice(0, 2);
	const specialCases: Record<string, string> = {
		ja: "jp",
		zh: "cn",
		vi: "vn",
		ko: "kr",
		en: "gb",
	};

	if (specialCases[thisLocale]) {
		return specialCases[thisLocale].toUpperCase();
	}
	return thisLocale.toUpperCase();
};

const cache = createIntlCache();
const defaultMessages = Object.assign({}, langList, langEn);
let intl = createIntl({ locale: "en", messages: defaultMessages }, cache);

const initLocale = async () => {
	const locale = getLocale();
	const messages = await getLocaleMessages(locale);
	intl = createIntl({ locale, messages }, cache);
	document.documentElement.lang = locale;
	return intl;
};

const changeLocale = (locale: string): void => {
	window.localStorage.setItem("locale", locale);
	document.documentElement.lang = locale;
};

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

export { getFlagCodeForLocale, getLocale, createIntl, changeLocale, intl, initLocale, T };
