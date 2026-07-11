import type { DbEngine } from "src/types/enums";
import * as api from "./base";

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
	return await api.get({ url: "/analytics/db-stats" });
}
