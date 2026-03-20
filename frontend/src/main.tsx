import React from "react";
import ReactDOM from "react-dom/client";
import App from "src/App.tsx";
import { initLocale } from "src/locale";

import "./index.css";

const bootstrap = async () => {
	await initLocale();

	ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
		<React.StrictMode>
			<App />
		</React.StrictMode>,
	);
};

void bootstrap();
