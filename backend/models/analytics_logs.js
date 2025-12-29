import { Model } from "objection";

class AnalyticsLogs extends Model {
	static get tableName() {
		return "analytics_logs";
	}

	static get idColumn() {
		return "id";
	}

	static get jsonSchema() {
		return {
			type: "object",
			properties: {
				id: { type: "integer" },
				host_id: { type: "integer" },
				time: { type: "string" },
				method: { type: ["string", "null"] },
				path: { type: ["string", "null"] },
				status: { type: "integer" },
				bytes: { type: "integer" },
				ip: { type: ["string", "null"] },
				country_code: { type: ["string", "null"] },
				referer: { type: ["string", "null"] },
				user_agent: { type: ["string", "null"] },
				duration: { type: "integer" },
				created_at: { type: "integer" },
			},
		};
	}
}

export default AnalyticsLogs;
