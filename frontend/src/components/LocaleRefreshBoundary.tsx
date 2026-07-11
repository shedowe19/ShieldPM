import { Fragment, type ReactNode } from "react";
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
			<Fragment key={locale}>{children}</Fragment>
		</RawIntlProvider>
	);
}

export { LocaleRefreshBoundary };
