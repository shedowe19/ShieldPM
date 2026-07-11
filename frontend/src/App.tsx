import { QueryClientProvider } from "@tanstack/react-query";
import EasyModal from "ez-modal-react";
import { queryClient } from "src/api/queryClient";
import { LocaleRefreshBoundary } from "src/components/LocaleRefreshBoundary";
import { AuthProvider, LocaleProvider, ThemeProvider } from "src/context";
import Router from "src/Router.tsx";
import { QueryDevtools } from "@/components/QueryDevtools";
import { Toaster } from "@/components/ui/toaster";

function App() {
	return (
		<LocaleProvider>
			<LocaleRefreshBoundary>
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
			</LocaleRefreshBoundary>
		</LocaleProvider>
	);
}

export default App;
