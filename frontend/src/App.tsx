import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EasyModal from "ez-modal-react";
import { lazy, Suspense } from "react";
import { RawIntlProvider } from "react-intl";
import { AuthProvider, LocaleProvider, ThemeProvider } from "src/context";
import { intl } from "src/locale";
import Router from "src/Router.tsx";
import { Toaster } from "@/components/ui/toaster";

const ReactQueryDevtools = import.meta.env.DEV
	? lazy(() => import("@tanstack/react-query-devtools").then((module) => ({ default: module.ReactQueryDevtools })))
	: null;

// Create a client
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 30, // 30 seconds
			refetchOnWindowFocus: false,
		},
	},
});

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
						{ReactQueryDevtools && (
							<Suspense fallback={null}>
								<ReactQueryDevtools buttonPosition="bottom-right" position="right" />
							</Suspense>
						)}
					</QueryClientProvider>
				</ThemeProvider>
			</LocaleProvider>
		</RawIntlProvider>
	);
}

export default App;
