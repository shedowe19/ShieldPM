import _ from "lodash";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import utils from "../lib/utils.js";
import deadHostModel from "../models/dead_host.js";
import internalAuditLog from "./audit-log.js";
import internalCertificate from "./certificate.js";
import internalGitOps from "./gitops.js";
import internalHost from "./host.js";
import internalNginx from "./nginx.js";

const omissions = () => {
	return ["is_deleted"];
};

const internalDeadHost = {
	/**
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		const createCertificate = data.certificate_id === "new";

		if (createCertificate) {
			delete data.certificate_id;
		}

		await access.can("dead_hosts:create", data);

		// Get a list of the domain names and check each of them against existing records
		const domainNameCheckPromises = [];

		data.domain_names.map((domain_name) => {
			domainNameCheckPromises.push(internalHost.isHostnameTaken(domain_name));
			return true;
		});

		const check_results = await Promise.all(domainNameCheckPromises);
		check_results.map((result) => {
			if (result.is_taken) {
				throw new errs.ValidationError(`${result.hostname} is already in use`);
			}
			return true;
		});

		// At this point the domains should have been checked
		data.owner_user_id = access.token.getUserId(1);
		const thisData = internalHost.cleanSslHstsData(createCertificate, data);

		// Fix for db field not having a default value
		// for this optional field.
		if (typeof data.advanced_config === "undefined") {
			thisData.advanced_config = "";
		}

		let row = await deadHostModel.query().insertAndFetch(thisData);
		row = utils.omitRow(omissions())(row);

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "dead-host",
			object_id: row.id,
			meta: thisData,
		});

		if (createCertificate) {
			const cert = await internalCertificate.createQuickCertificate(access, data);

			// update host with cert id
			await internalDeadHost.update(
				access,
				{
					id: row.id,
					certificate_id: cert.id,
				},
				{ skip_configure: true },
			);
		}

		// re-fetch with cert
		const freshRow = await internalDeadHost.get(access, {
			id: row.id,
			expand: ["certificate", "owner"],
		});

		// Sanity check
		if (createCertificate && !freshRow.certificate_id) {
			throw new errs.InternalValidationError("The host was created but the Certificate creation failed.");
		}

		// Configure nginx
		await internalNginx.configure(deadHostModel, "dead_host", freshRow);

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("dead-host");

		return freshRow;
	},

	/**
	 * @param  {import("../lib/types.js").Access}  access
	 * @param  {any}  data
	 * @param  {any}  data
	 * @return {Promise}
	 */
	update: async (access, data, options = {}) => {
		let thisData = /** @type {any} */ (data);
		const createCertificate = thisData.certificate_id === "new";
		if (createCertificate) {
			delete thisData.certificate_id;
		}

		await access.can("dead_hosts:update", thisData.id);

		// Get a list of the domain names and check each of them against existing records
		const domainNameCheckPromises = [];
		if (typeof thisData.domain_names !== "undefined") {
			thisData.domain_names.map((/** @type {any} */ domainName) => {
				domainNameCheckPromises.push(internalHost.isHostnameTaken(domainName, "dead", thisData.id));
				return true;
			});

			const checkResults = await Promise.all(domainNameCheckPromises);
			checkResults.map((/** @type {any} */ result) => {
				if (result.is_taken) {
					throw new errs.ValidationError(`${result.hostname} is already in use`);
				}
				return true;
			});
		}
		const row = await internalDeadHost.get(access, { id: thisData.id });

		if (row.id !== thisData.id) {
			// Sanity check that something crazy hasn't happened
			throw new errs.InternalValidationError(
				`404 Host could not be updated, IDs do not match: ${row.id} !== ${thisData.id}`,
			);
		}

		if (createCertificate) {
			const cert = await internalCertificate.createQuickCertificate(
				access,
				/** @type {any} */ ({
					domain_names: thisData.domain_names || row.domain_names,
					meta: _.assign({}, row.meta, thisData.meta),
				}),
			);

			// update host with cert id
			thisData.certificate_id = cert.id;
		}

		// Add domain_names to the data in case it isn't there, so that the audit log renders correctly. The order is important here.
		thisData = _.assign(
			{},
			{
				domain_names: row.domain_names,
			},
			data,
		);

		thisData = internalHost.cleanSslHstsData(createCertificate, thisData, row);

		// do the row update
		await deadHostModel.query().where({ id: data.id }).patch(data);

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "dead-host",
			object_id: row.id,
			meta: thisData,
		});

		const thisRow = await internalDeadHost.get(access, {
			id: thisData.id,
			expand: ["owner", "certificate"],
		});

		if (!options.skip_configure) {
			// Configure nginx
			const newMeta = await internalNginx.configure(deadHostModel, "dead_host", row);
			row.meta = newMeta;
		}

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("dead-host");

		return _.omit(internalHost.cleanRowCertificateMeta(thisRow), omissions());
	},

	/**
	 * @param  {import("../lib/types.js").Access}   access
	 * @param  {Object}   data
	 * @param  {Number}   data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @return {Promise}
	 */
	get: async (access, data) => {
		const thisData = /** @type {any} */ (data || {});
		const accessData = await access.can("dead_hosts:get", thisData.id);
		const query = deadHostModel
			.query()
			.where("is_deleted", 0)
			.andWhere("id", thisData.id)
			.allowGraph("[owner,certificate]")
			.first();

		if (accessData.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
			query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
		}

		let row = await query;

		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(thisData.id);
		}

		row = utils.omitRow(omissions())(row);

		// Custom omissions
		if (typeof thisData.omit !== "undefined" && thisData.omit !== null) {
			return _.omit(row, thisData.omit);
		}
		return row;
	},

	/**
	 * @param {import("../lib/types.js").Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	delete: async (access, data) => {
		const thisData = /** @type {any} */ (data);
		await access.can("dead_hosts:delete", thisData.id);
		const row = await internalDeadHost.get(access, { id: thisData.id });
		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(thisData.id);
		}

		await deadHostModel.query().where("id", row.id).patch({
			is_deleted: 1,
		});

		// Delete Nginx Config
		await internalNginx.deleteConfig("dead_host", row);
		await internalNginx.reload();

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "dead-host",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("dead-host");

		return true;
	},

	/**
	 * @param {import("../lib/types.js").Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	enable: async (access, data) => {
		const thisData = /** @type {any} */ (data);
		await access.can("dead_hosts:update", thisData.id);
		const row = await internalDeadHost.get(access, {
			id: thisData.id,
			expand: ["certificate", "owner"],
		});
		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(thisData.id);
		}
		if (row.enabled) {
			throw new errs.ValidationError("Host is already enabled");
		}

		row.enabled = 1;

		await deadHostModel
			.query()
			.where("id", row.id)
			.patch(
				/** @type {any} */ ({
					enabled: 1,
				}),
			);

		// Configure nginx
		await internalNginx.configure(deadHostModel, "dead_host", row);

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "enabled",
			object_type: "dead-host",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});
		return true;
	},

	/**
	 * @param {import("../lib/types.js").Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	disable: async (access, data) => {
		const thisData = /** @type {any} */ (data);
		await access.can("dead_hosts:update", thisData.id);
		const row = await internalDeadHost.get(access, { id: thisData.id });
		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(thisData.id);
		}
		if (!row.enabled) {
			throw new errs.ValidationError("Host is already disabled");
		}

		row.enabled = 0;

		await deadHostModel
			.query()
			.where("id", row.id)
			.patch(
				/** @type {any} */ ({
					enabled: 0,
				}),
			);

		// Delete Nginx Config
		await internalNginx.deleteConfig("dead_host", row);
		await internalNginx.reload();

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "disabled",
			object_type: "dead-host",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});
		return true;
	},

	/**
	 * All Hosts
	 *
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [searchQuery]
	 * @returns {Promise}
	 */
	getAll: async (access, expand, searchQuery) => {
		const accessData = await access.can("dead_hosts:list");
		const query = deadHostModel
			.query()
			.where("is_deleted", 0)
			.groupBy("id")
			.allowGraph("[owner,certificate]")
			.orderBy(castJsonIfNeed("domain_names"), "ASC");

		if (accessData.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		// Query is used for searching
		if (typeof searchQuery === "string" && searchQuery.length > 0) {
			query.where(function () {
				this.where(castJsonIfNeed("domain_names"), "like", `%${searchQuery}%`);
			});
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		let rows = await query;
		rows = utils.omitRows(omissions())(rows);

		if (typeof expand !== "undefined" && expand !== null && expand.indexOf("certificate") !== -1) {
			internalHost.cleanAllRowsCertificateMeta(rows);
		}
		return rows;
	},

	/**
	 * Report use
	 *
	 * @param   {Number}  user_id
	 * @param   {String}  visibility
	 * @returns {Promise}
	 */
	getCount: async (user_id, visibility) => {
		const query = deadHostModel.query().count("id as count").where("is_deleted", 0);

		if (visibility !== "all") {
			query.andWhere("owner_user_id", user_id);
		}

		const row = await query.first();
		return Number.parseInt(/** @type {any} */ (row).count, 10);
	},
};

export default internalDeadHost;
