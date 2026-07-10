import React from "react";
import ReactDOM from "react-dom/client";
import App from "src/App.tsx";
import { initializeLocale } from "src/locale";

import "./index.css";

void initializeLocale().finally(() => {
	ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
		<React.StrictMode>
			<App />
		</React.StrictMode>,
	);
});
