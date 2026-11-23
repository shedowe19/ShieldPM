import { Model } from "objection";
import ProxyHost from "./proxy_host.js";

class AnalyticsHourly extends Model {
	static get tableName() {
		return "analytics_hourly";
	}

	static get idColumn() {
		return "id";
	}

	static get jsonSchema() {
		return {
			type: "object",
			properties: {
				id: { type: "integer" },
				proxy_host_id: { type: ["integer", "null"] },
				bucket_key: { type: "string" },
				bucket_start: { type: "string" },
				request_count: { type: "integer" },
				bytes_sent: { type: "integer" },
				status_code_2xx: { type: "integer" },
				status_code_3xx: { type: "integer" },
				status_code_4xx: { type: "integer" },
				status_code_5xx: { type: "integer" },
				duration_sum: { type: "integer" },
				duration_count: { type: "integer" },
				rolled_up_at: { type: "integer" },
			},
		};
	}

	static get relationMappings() {
		return {
			proxy_host: {
				relation: Model.BelongsToOneRelation,
				modelClass: ProxyHost,
				join: {
					from: "analytics_hourly.proxy_host_id",
					to: "proxy_host.id",
				},
			},
		};
	}
}

export default AnalyticsHourly;
