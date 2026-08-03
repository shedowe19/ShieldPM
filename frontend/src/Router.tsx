import { AnimatePresence, domAnimation, LazyMotion } from "framer-motion";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AnimatedPage } from "src/components/AnimatedPage";
import { ErrorNotFound } from "src/components/ErrorNotFound";
import { LoadingPage } from "src/components/LoadingPage";
import { Page } from "src/components/Page";
import { RouteErrorBoundary } from "src/components/RouteErrorBoundary";
import { Sidebar } from "src/components/Sidebar";
import { SiteContainer } from "src/components/SiteContainer";
import { SiteFooter } from "src/components/SiteFooter";
import { SiteHeader } from "src/components/SiteHeader";
import { Unhealthy } from "src/components/Unhealthy";
import { useAuthState } from "src/context";
import { useHealth } from "src/hooks/useHealth";
import { T } from "src/locale";

const Setup = lazy(() => import("src/pages/Setup"));
const Login = lazy(() => import("src/pages/Login"));
const Dashboard = lazy(() => import("src/pages/Dashboard"));
const Analytics = lazy(() => import("src/pages/Analytics"));
const Settings = lazy(() => import("src/pages/Settings"));
const Certificates = lazy(() => import("src/pages/Certificates"));
const Access = lazy(() => import("src/pages/Access"));
const AuditLog = lazy(() => import("src/pages/AuditLog"));
const Users = lazy(() => import("src/pages/Users"));
const ProxyHosts = lazy(() => import("src/pages/Nginx/ProxyHosts"));
const RedirectionHosts = lazy(() => import("src/pages/Nginx/RedirectionHosts"));
const DeadHosts = lazy(() => import("src/pages/Nginx/DeadHosts"));
const Streams = lazy(() => import("src/pages/Nginx/Streams"));
const CloudflaredTunnels = lazy(() => import("src/pages/Nginx/CloudflaredTunnels"));
const DdnsProviders = lazy(() => import("src/pages/Nginx/DdnsProviders"));
const FirewallPolicies = lazy(() => import("src/pages/Nginx/FirewallPolicies"));
const TorOnionServices = lazy(() => import("src/pages/Nginx/TorOnionServices"));
const WireguardTunnels = lazy(() => import("src/pages/Nginx/WireguardTunnels"));
const ChatOps = lazy(() => import("src/pages/ChatOps"));
const Profile = lazy(() => import("src/pages/Profile"));
const DuoCallback = lazy(() => import("src/pages/DuoCallback"));

function Content() {
	const location = useLocation();
	const routes = (
		<AnimatePresence mode="wait">
			<Routes location={location} key={location.pathname}>
				<Route
					path="*"
					element={
						<AnimatedPage>
							<ErrorNotFound />
						</AnimatedPage>
					}
				/>
				<Route
					path="/certificates"
					element={
						<AnimatedPage>
							<Certificates />
						</AnimatedPage>
					}
				/>
				<Route
					path="/access"
					element={
						<AnimatedPage>
							<Access />
						</AnimatedPage>
					}
				/>
				<Route
					path="/audit-log"
					element={
						<AnimatedPage>
							<AuditLog />
						</AnimatedPage>
					}
				/>
				<Route
					path="/settings"
					element={
						<AnimatedPage>
							<Settings />
						</AnimatedPage>
					}
				/>
				<Route
					path="/users"
					element={
						<AnimatedPage>
							<Users />
						</AnimatedPage>
					}
				/>
				<Route
					path="/nginx/proxy"
					element={
						<AnimatedPage>
							<ProxyHosts />
						</AnimatedPage>
					}
				/>
				<Route
					path="/nginx/redirection"
					element={
						<AnimatedPage>
							<RedirectionHosts />
						</AnimatedPage>
					}
				/>
				<Route
					path="/nginx/404"
					element={
						<AnimatedPage>
							<DeadHosts />
						</AnimatedPage>
					}
				/>
				<Route
					path="/nginx/stream"
					element={
						<AnimatedPage>
							<Streams />
						</AnimatedPage>
					}
				/>
				<Route
					path="/nginx/cloudflared"
					element={
						<AnimatedPage>
							<CloudflaredTunnels />
						</AnimatedPage>
					}
				/>
				<Route
					path="/nginx/ddns"
					element={
						<AnimatedPage>
							<DdnsProviders />
						</AnimatedPage>
					}
				/>
				<Route
					path="/nginx/firewall"
					element={
						<AnimatedPage>
							<FirewallPolicies />
						</AnimatedPage>
					}
				/>
				<Route
					path="/nginx/tor"
					element={
						<AnimatedPage>
							<TorOnionServices />
						</AnimatedPage>
					}
				/>
				<Route
					path="/nginx/wireguard"
					element={
						<AnimatedPage>
							<WireguardTunnels />
						</AnimatedPage>
					}
				/>
				<Route
					path="/"
					element={
						<AnimatedPage>
							<Dashboard />
						</AnimatedPage>
					}
				/>
				<Route
					path="/analytics"
					element={
						<AnimatedPage>
							<Analytics />
						</AnimatedPage>
					}
				/>
				<Route
					path="/chatops"
					element={
						<AnimatedPage>
							<ChatOps />
						</AnimatedPage>
					}
				/>
				<Route
					path="/profile"
					element={
						<AnimatedPage>
							<Profile />
						</AnimatedPage>
					}
				/>
				<Route
					path="/duo-callback"
					element={
						<AnimatedPage>
							<DuoCallback />
						</AnimatedPage>
					}
				/>
			</Routes>
		</AnimatePresence>
	);

	return <RouteErrorBoundary resetKey={location.pathname}>{routes}</RouteErrorBoundary>;
}

function Router() {
	const health = useHealth();
	const { authenticated } = useAuthState();

	if (health.isLoading) {
		return <LoadingPage />;
	}

	if (health.isError || health.data?.status !== "OK") {
		return <Unhealthy />;
	}

	if (!health.data?.setup) {
		return <Setup />;
	}

	if (!authenticated) {
		return (
			<BrowserRouter>
				<RouteErrorBoundary>
					<Suspense fallback={<LoadingPage />}>
						<Routes>
							<Route path="/duo-callback" element={<DuoCallback />} />
							<Route path="*" element={<Login />} />
						</Routes>
					</Suspense>
				</RouteErrorBoundary>
			</BrowserRouter>
		);
	}

	return (
		<LazyMotion features={domAnimation}>
			<BrowserRouter>
				<Page>
					<a
						href="#app-content"
						className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-foreground focus:shadow-lg"
					>
						<T id="sr.skip-to-content" />
					</a>
					<Sidebar />
					<div className="page-wrapper lg:pl-[240px] flex flex-col min-h-screen">
						<SiteHeader />
						<SiteContainer>
							<Suspense fallback={<LoadingPage noLogo />}>
								<Content />
							</Suspense>
						</SiteContainer>
						<SiteFooter />
					</div>
				</Page>
			</BrowserRouter>
		</LazyMotion>
	);
}

export default Router;
