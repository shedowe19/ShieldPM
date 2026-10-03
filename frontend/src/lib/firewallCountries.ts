import countries from "i18n-iso-countries";
import deLocale from "i18n-iso-countries/langs/de.json";
import enLocale from "i18n-iso-countries/langs/en.json";

countries.registerLocale(deLocale);
countries.registerLocale(enLocale);

export interface FirewallCountryOption {
	value: string;
	label: string;
}

const countryLanguage = (language: string) => (language.toLowerCase().startsWith("de") ? "de" : "en");

export const firewallCountryName = (code: string, language = "en"): string =>
	countries.getName(code, countryLanguage(language), { select: "official" }) || code;

export const firewallCountryOptions = (language = "en"): FirewallCountryOption[] =>
	Object.entries(countries.getNames(countryLanguage(language), { select: "official" }))
		.map(([value, name]) => ({ value, label: `${name} · ${value}` }))
		.sort((left, right) => left.label.localeCompare(right.label, countryLanguage(language)));
