const memory = new Map<string, string>();
const unsaved = new Set<string>();

// Browser policies and full storage must not prevent the app from mounting or
// changing preferences. Unsaved choices remain available for this page session.
export function readPreference(key: string): string | null {
	if (unsaved.has(key)) return memory.get(key) ?? null;
	try {
		const value = window.localStorage.getItem(key);
		if (value === null) memory.delete(key);
		else memory.set(key, value);
		return value;
	} catch {
		return memory.get(key) ?? null;
	}
}

export function writePreference(key: string, value: string): void {
	memory.set(key, value);
	try {
		window.localStorage.setItem(key, value);
		unsaved.delete(key);
	} catch {
		unsaved.add(key);
	}
}
