import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EasyModal from "ez-modal-react";
import { RawIntlProvider } from "react-intl";
import { AuthProvider, LocaleProvider, ThemeProvider } from "src/context";
import { intl } from "src/locale";
import Router from "src/Router.tsx";
import { QueryDevtools } from "@/components/QueryDevtools";
import { Toaster } from "@/components/ui/toaster";

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
						<QueryDevtools />
					</QueryClientProvider>
				</ThemeProvider>
			</LocaleProvider>
		</RawIntlProvider>
	);
}

export default App;
