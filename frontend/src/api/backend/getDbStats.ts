import type { DbEngine } from "src/types/enums";

export interface DbStats {
	engine: DbEngine;
	size: number;
	connections: {
		open: number;
		used: number;
		max: number;
	};
	io: {
		reads: number;
		writes: number;
	};
}

export async function getDbStats(): Promise<DbStats> {
	const response = await fetch("/api/analytics/db-stats");
	if (!response.ok) throw new Error("Failed to fetch DB stats");
	return response.json();
}
