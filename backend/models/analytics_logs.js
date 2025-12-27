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
                method: { type: "string" },
                path: { type: "string" },
                status: { type: "integer" },
                bytes: { type: "integer" },
                ip: { type: "string" },
                country_code: { type: "string" },
                referer: { type: "string" },
                user_agent: { type: "string" },
                duration: { type: "integer" },
                created_at: { type: "integer" },
            },
        };
    }
}

export default AnalyticsLogs;
