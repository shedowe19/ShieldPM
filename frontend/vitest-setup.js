import "@testing-library/jest-dom/vitest";

// Node 26 exposes an experimental global localStorage getter that is undefined
// without --localstorage-file. Happy DOM mirrors that getter onto window, so
// provide the storage API the browser-based frontend tests require.
if (typeof window.localStorage?.getItem !== "function") {
	const entries = new Map();

	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: {
			clear: () => entries.clear(),
			getItem: (key) => entries.get(key) ?? null,
			key: (index) => [...entries.keys()][index] ?? null,
			get length() {
				return entries.size;
			},
			removeItem: (key) => entries.delete(key),
			setItem: (key, value) => entries.set(String(key), String(value)),
		},
	});
}
