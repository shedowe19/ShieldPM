import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import EasyModal from "ez-modal-react";
import React from "react";
import { RawIntlProvider } from "react-intl";
import { AuthProvider, LocaleProvider, ThemeProvider } from "src/context";
import { intl } from "src/locale";
import { Toaster } from "@/components/ui/toaster";

// Create a client
const queryClient = new QueryClient();

export default function Wrapper({ children }: { children: React.ReactNode }) {
	return (
		<RawIntlProvider value={intl}>
			<LocaleProvider>
				<ThemeProvider>
					<QueryClientProvider client={queryClient}>
						<AuthProvider>
							<EasyModal.Provider>
								{children}
							</EasyModal.Provider>
							<Toaster />
						</AuthProvider>
						<ReactQueryDevtools buttonPosition="bottom-right" position="right" />
					</QueryClientProvider>
				</ThemeProvider>
			</LocaleProvider>
		</RawIntlProvider>
	);
}
