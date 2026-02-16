import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import EasyModal from "ez-modal-react";
import { lazy, Suspense } from "react";
import { RawIntlProvider } from "react-intl";
import { LoadingPage } from "src/components";
import { AuthProvider, LocaleProvider, ThemeProvider } from "src/context";
import { intl } from "src/locale";
import { Toaster } from "@/components/ui/toaster";

const Router = lazy(() => import("src/Router.tsx"));

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
								<Suspense fallback={<LoadingPage />}>
									<Router />
								</Suspense>
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
