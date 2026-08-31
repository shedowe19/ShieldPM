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

const runtimeFailure = (message, error, rollbackResults) => {
	const failures = rollbackResults
		.filter((result) => result.status === "rejected")
		.map((result) => result.reason?.message || String(result.reason));
	return new errs.ConfigurationError(
		`${message}: ${error.message}${failures.length ? `; rollback errors: ${failures.join("; ")}` : ""}`,
		error,
	);
};

const internalDeadHost = {
	/**
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		const createCertificate = data.certificate_id === "new";
		let createdCertificateId = null;

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
		const thisData = /** @type {any} */ (internalHost.cleanSslHstsData(createCertificate, data));

		// Fix for db field not having a default value
		// for this optional field.
		if (typeof data.advanced_config === "undefined") {
			thisData.advanced_config = "";
		}

		let row = await deadHostModel.query().insertAndFetch(thisData);
		row = utils.omitRow(omissions())(row);

		if (createCertificate) {
			try {
				const cert = await internalCertificate.createQuickCertificate(access, data);
				createdCertificateId = cert.id;
				await deadHostModel.query().findById(row.id).patch({ certificate_id: cert.id });
			} catch (error) {
				const rollbackResults = await Promise.allSettled([
					deadHostModel.query().deleteById(row.id),
					createdCertificateId
						? internalCertificate.delete(access, { id: createdCertificateId })
						: Promise.resolve(),
				]);
				throw runtimeFailure("404-host certificate creation failed", error, rollbackResults);
			}
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

		try {
			await internalNginx.configure(deadHostModel, "dead_host", freshRow);
		} catch (error) {
			const rollbackResults = await Promise.allSettled([
				deadHostModel.query().deleteById(row.id),
				createdCertificateId
					? internalCertificate.delete(access, { id: createdCertificateId })
					: Promise.resolve(),
			]);
			throw runtimeFailure("404-host creation failed", error, rollbackResults);
		}

		await internalAuditLog.add(access, {
			action: "created",
			object_type: "dead-host",
			object_id: row.id,
			meta: thisData,
		});

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
		let createdCertificateId = null;
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
		const snapshot = await deadHostModel.query().findById(thisData.id).where("is_deleted", 0);

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
			createdCertificateId = cert.id;

			// update host with cert id
			thisData.certificate_id = cert.id;
		}

		// Add domain_names to the data in case it isn't there, so that the audit log renders correctly. The order is important here.
		thisData = _.assign(
			{},
			{
				domain_names: row.domain_names,
			},
			thisData,
		);

		thisData = internalHost.cleanSslHstsData(createCertificate, thisData, row);

		// do the row update
		await deadHostModel.query().where({ id: data.id }).patch(thisData);

		const thisRow = await internalDeadHost.get(access, {
			id: thisData.id,
			expand: ["owner", "certificate"],
		});

		if (!options.skip_configure) {
			try {
				await internalNginx.configure(deadHostModel, "dead_host", thisRow);
			} catch (error) {
				const rollbackResults = await Promise.allSettled([
					deadHostModel
						.query()
						.findById(row.id)
						.patch(_.omit(snapshot.toJSON(), ["id", "created_on", "modified_on"])),
					createdCertificateId
						? internalCertificate.delete(access, { id: createdCertificateId })
						: Promise.resolve(),
				]);
				if (rollbackResults[0].status === "fulfilled") {
					rollbackResults.push(
						...(await Promise.allSettled([
							internalDeadHost
								.get(access, { id: row.id, expand: ["owner", "certificate"] })
								.then((restored) => internalNginx.configure(deadHostModel, "dead_host", restored)),
						])),
					);
				}
				throw runtimeFailure("404-host update failed", error, rollbackResults);
			}
		}

		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "dead-host",
			object_id: row.id,
			meta: thisData,
		});

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

		if (!row?.id) {
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
		if (!row?.id) {
			throw new errs.ItemNotFoundError(thisData.id);
		}

		try {
			await deadHostModel.query().where("id", row.id).patch({ is_deleted: 1 });
			await internalNginx.deleteConfig("dead_host", row);
		} catch (error) {
			const rollbackResults = await Promise.allSettled([
				deadHostModel.query().findById(row.id).patch({ is_deleted: 0 }),
				internalNginx.configure(deadHostModel, "dead_host", row),
			]);
			throw runtimeFailure("404-host deletion failed", error, rollbackResults);
		}

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
		if (!row?.id) {
			throw new errs.ItemNotFoundError(thisData.id);
		}
		if (row.enabled) {
			throw new errs.ValidationError("Host is already enabled");
		}

		row.enabled = 1;

		try {
			await deadHostModel.query().where("id", row.id).patch({ enabled: 1 });
			await internalNginx.configure(deadHostModel, "dead_host", row);
		} catch (error) {
			const rollbackResults = await Promise.allSettled([
				deadHostModel.query().findById(row.id).patch({ enabled: 0 }),
				internalNginx.deleteConfig("dead_host", row),
			]);
			throw runtimeFailure("404-host enable failed", error, rollbackResults);
		}

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
		if (!row?.id) {
			throw new errs.ItemNotFoundError(thisData.id);
		}
		if (!row.enabled) {
			throw new errs.ValidationError("Host is already disabled");
		}

		row.enabled = 0;

		try {
			await deadHostModel.query().where("id", row.id).patch({ enabled: 0 });
			await internalNginx.deleteConfig("dead_host", row);
		} catch (error) {
			const rollbackResults = await Promise.allSettled([
				deadHostModel.query().findById(row.id).patch({ enabled: 1 }),
				internalNginx.configure(deadHostModel, "dead_host", { ...row, enabled: 1 }),
			]);
			throw runtimeFailure("404-host disable failed", error, rollbackResults);
		}

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
