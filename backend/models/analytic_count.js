import { Model } from "objection";
import ProxyHost from "./proxy_host.js";

class AnalyticCount extends Model {
	static get tableName() {
		return "analytic_count";
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
				aggregation_key: { type: "string" },
				aggregation_timestamp: { type: "string" },
				aggregation_generation: { type: "string" },
				timestamp: { type: "string" },
				status_code_2xx: { type: "integer" },
				status_code_3xx: { type: "integer" },
				status_code_4xx: { type: "integer" },
				status_code_5xx: { type: "integer" },
				bytes_sent: { type: "integer" },
				request_count: { type: "integer" },
			},
		};
	}

	static get relationMappings() {
		return {
			proxy_host: {
				relation: Model.BelongsToOneRelation,
				modelClass: ProxyHost,
				join: {
					from: "analytic_count.proxy_host_id",
					to: "proxy_host.id",
				},
			},
		};
	}
}

export default AnalyticCount;
