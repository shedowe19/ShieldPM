import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import EasyModal from "ez-modal-react";
import { RawIntlProvider } from "react-intl";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, LocaleProvider, ThemeProvider } from "src/context";
import { intl } from "src/locale";
import Router from "src/Router.tsx";

// Create a client
const queryClient = new QueryClient();

function App() {
	return (
		<RawIntlProvider value={intl}>
			<LocaleProvider>
				<ThemeProvider>
					<QueryClientProvider client={queryClient}>
						<AuthProvider>
							<EasyModal.Provider>
								<Router />
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

export default App;
