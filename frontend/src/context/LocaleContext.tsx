import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { RawIntlProvider } from "react-intl";
import { changeLocale, getLocale, intl } from "src/locale";

// Context
export interface LocaleContextType {
	setLocale: (locale: string) => void;
	locale?: string;
}

const initalValue = null;
const LocaleContext = createContext<LocaleContextType | null>(initalValue);

// Provider
interface Props {
	children?: ReactNode;
}
function LocaleProvider({ children }: Props) {
	const [locale, setLocaleValue] = useState(getLocale());
	// We use this state to trigger re-renders when messages load
	const [, setMessages] = useState(intl.messages);

	// Load messages on mount and change
	useEffect(() => {
		const load = async () => {
			await changeLocale(locale);
			setMessages(intl.messages);
		};
		load();
	}, [locale]);

	const setLocale = async (newLocale: string) => {
		setLocaleValue(newLocale);
	};

	const value = { locale, setLocale };

	// We wrap the children in RawIntlProvider here to ensure updates propagate
	// creating a new intl object is handled in `changeLocale` but we need to pass it down
	return (
		<LocaleContext.Provider value={value}>
			<RawIntlProvider value={intl}>{children}</RawIntlProvider>
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

export { LocaleProvider, useLocaleState };
export default LocaleContext;
