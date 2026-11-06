import { FLOW_SETTING_ID, importedFlowSettings } from "../lib/traffic-flow-settings.js";

export async function up(knex) {
	if (await knex("setting").where({ id: FLOW_SETTING_ID }).first()) return;
	await knex("setting").insert({
		id: FLOW_SETTING_ID,
		name: "Traffic Flow",
		description: "Traffic observations, live measurement and client address display",
		value: "configured",
		meta: JSON.stringify(importedFlowSettings()),
	});
}
export async function down(knex) {
	await knex("setting").where({ id: FLOW_SETTING_ID }).delete();
}
