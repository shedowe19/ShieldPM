import type { ReactNode } from "react";
import { RawIntlProvider } from "react-intl";
import { useLocaleState } from "src/context";
import { intl } from "src/locale";

interface Props {
	children: ReactNode;
}

function LocaleRefreshBoundary({ children }: Props) {
	const { locale } = useLocaleState();

	return (
		<RawIntlProvider value={intl}>
			<div data-locale={locale}>{children}</div>
		</RawIntlProvider>
	);
}

export { LocaleRefreshBoundary };
