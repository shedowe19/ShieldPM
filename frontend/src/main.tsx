import React from "react";
import ReactDOM from "react-dom/client";
import App from "src/App.tsx";

import "./index.css";

// Expose globals for dynamic Addon modules
(window as any).React = React;
(window as any).ReactDOM = ReactDOM;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
