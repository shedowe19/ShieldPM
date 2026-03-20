import { useEffect, useState } from "react";

export const usePageVisibility = () => {
	const [isVisible, setIsVisible] = useState(() => document.visibilityState === "visible");

	useEffect(() => {
		const onVisibilityChange = () => {
			setIsVisible(document.visibilityState === "visible");
		};

		document.addEventListener("visibilitychange", onVisibilityChange);
		return () => document.removeEventListener("visibilitychange", onVisibilityChange);
	}, []);

	return isVisible;
};
