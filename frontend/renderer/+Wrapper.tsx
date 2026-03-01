import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import EasyModal from "ez-modal-react";
import type React from "react";
import { RawIntlProvider } from "react-intl";
import { AuthProvider, LocaleProvider, ThemeProvider } from "../src/context";
import { intl } from "../src/locale";
import { Toaster } from "../src/components/ui/toaster";

export default function Wrapper({ children }: { children: React.ReactNode }) {
	// Provide a new QueryClient per-request in SSR to prevent data leaks.
	const [queryClient] = React.useState(() => new QueryClient());
	return (
		<RawIntlProvider value={intl}>
			<LocaleProvider>
				<ThemeProvider>
					<QueryClientProvider client={queryClient}>
						<AuthProvider>
							<EasyModal.Provider>{children}</EasyModal.Provider>
							<Toaster />
						</AuthProvider>
						<ReactQueryDevtools buttonPosition="bottom-right" position="right" />
					</QueryClientProvider>
				</ThemeProvider>
			</LocaleProvider>
		</RawIntlProvider>
	);
}
