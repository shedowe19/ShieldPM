import { lazy, Suspense } from "react";

const ReactQueryDevtools = import.meta.env.DEV
	? lazy(async () => {
			const { ReactQueryDevtools: Devtools } = await import("@tanstack/react-query-devtools");
			return { default: Devtools };
		})
	: null;

function QueryDevtools() {
	if (!ReactQueryDevtools) {
		return null;
	}

	return (
		<Suspense fallback={null}>
			<ReactQueryDevtools buttonPosition="bottom-right" position="right" />
		</Suspense>
	);
}

export { QueryDevtools };
