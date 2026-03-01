import React from "react";
import { StaticRouter } from "react-router";
import { BrowserRouter } from "react-router-dom";
import { usePageContext } from "vike-react/usePageContext";
import "../src/index.css";

function RouterWrapper({ children }: { children: React.ReactNode }) {
	const pageContext = usePageContext();
	const isServer = typeof window === "undefined";

	if (isServer) {
		// SSR: StaticRouter doesn't use browser APIs
		return <StaticRouter location={pageContext.urlPathname}>{children}</StaticRouter>;
	}

	// Client: BrowserRouter for SPA navigation
	return <BrowserRouter>{children}</BrowserRouter>;
}

import Wrapper from "./+Wrapper";

export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<React.StrictMode>
			<Wrapper>
				<RouterWrapper>{children}</RouterWrapper>
			</Wrapper>
		</React.StrictMode>
	);
}
