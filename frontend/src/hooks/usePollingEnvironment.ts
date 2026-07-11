import { useEffect, useState } from "react";

export interface PollingEnvironment {
	isDocumentVisible: boolean;
	isOnline: boolean;
}

const getPollingEnvironment = (): PollingEnvironment => ({
	isDocumentVisible: document.visibilityState === "visible",
	isOnline: navigator.onLine,
});

export const usePollingEnvironment = (): PollingEnvironment => {
	const [environment, setEnvironment] = useState(getPollingEnvironment);

	useEffect(() => {
		const updateEnvironment = () => setEnvironment(getPollingEnvironment());

		document.addEventListener("visibilitychange", updateEnvironment);
		window.addEventListener("online", updateEnvironment);
		window.addEventListener("offline", updateEnvironment);
		return () => {
			document.removeEventListener("visibilitychange", updateEnvironment);
			window.removeEventListener("online", updateEnvironment);
			window.removeEventListener("offline", updateEnvironment);
		};
	}, []);

	return environment;
};
