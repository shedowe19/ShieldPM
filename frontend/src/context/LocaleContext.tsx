import { createContext, type ReactNode, useContext, useState } from "react";
import { getLocale } from "src/locale";

// Context
export interface LocaleContextType {
	setLocale: (locale: string) => void;
	locale?: string;
}

const initalValue = null;
const LocaleContext = createContext<LocaleContextType | null>(initalValue);
const LocaleRevisionContext = createContext("");

// Provider
interface Props {
	children?: ReactNode;
}
function LocaleProvider({ children }: Props) {
	const [locale, setLocaleValue] = useState(getLocale());

	const setLocale = async (locale: string) => {
		setLocaleValue(locale);
	};

	const value = { locale, setLocale };

	return (
		<LocaleContext.Provider value={value}>
			<LocaleRevisionContext.Provider value={locale}>{children}</LocaleRevisionContext.Provider>
		</LocaleContext.Provider>
	);
}

function useLocaleState() {
	const context = useContext(LocaleContext);
	if (!context) {
		throw new Error("useLocaleState must be used within a LocaleProvider");
	}
	return context;
}

function useLocaleRevision() {
	return useContext(LocaleRevisionContext);
}

export { LocaleProvider, useLocaleRevision, useLocaleState };
export default LocaleContext;
