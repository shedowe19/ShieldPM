import _ from "lodash";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import utils from "../lib/utils.js";
import redirectionHostModel from "../models/redirection_host.js";
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

const internalRedirectionHost = {
	/**
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Object}  data
	 * @param   {Array<string>} data.domain_names
	 * @param   {string}  data.forward_scheme
	 * @param   {string}  data.forward_domain_name
	 * @param   {number}  data.forward_http_code
	 * @param   {boolean} [data.preserve_path]
	 * @param   {number|string}  [data.certificate_id]
	 * @param   {boolean} [data.ssl_forced]
	 * @param   {boolean} [data.hsts_enabled]
	 * @param   {boolean} [data.hsts_subdomains]
	 * @param   {boolean} [data.http2_support]
	 * @param   {boolean} [data.block_exploits]
	 * @param   {string}  [data.advanced_config]
	 * @param   {Object}  [data.meta]
	 * @param   {number}  [data.owner_user_id]
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		let thisData = /** @type {any} */ (data || {});
		const createCertificate = thisData.certificate_id === "new";
		let createdCertificateId = null;

		if (createCertificate) {
			delete thisData.certificate_id;
		}

		await access.can("redirection_hosts:create", thisData);

		// Get a list of the domain names and check each of them against existing records
		const domain_name_check_promises = [];

		thisData.domain_names.map((domain_name) => {
			domain_name_check_promises.push(internalHost.isHostnameTaken(domain_name));
			return true;
		});

		const check_results = await Promise.all(domain_name_check_promises);
		check_results.map((result) => {
			if (result.is_taken) {
				throw new errs.ValidationError(`${result.hostname} is already in use`);
			}
			return true;
		});

		// At this point the domains should have been checked
		thisData.owner_user_id = access.token.getUserId(1);
		thisData = internalHost.cleanSslHstsData(createCertificate, thisData);

		// Fix for db field not having a default value
		// for this optional field.
		if (typeof data.advanced_config === "undefined") {
			data.advanced_config = "";
		}

		let row = await redirectionHostModel.query().insertAndFetch(/** @type {any} */ (thisData));
		row = utils.omitRow(omissions())(row);

		if (createCertificate) {
			try {
				const cert = await internalCertificate.createQuickCertificate(access, thisData);
				createdCertificateId = cert.id;
				await redirectionHostModel.query().findById(row.id).patch({ certificate_id: cert.id });
			} catch (error) {
				const rollbackResults = await Promise.allSettled([
					redirectionHostModel.query().deleteById(row.id),
					createdCertificateId
						? internalCertificate.delete(access, { id: createdCertificateId })
						: Promise.resolve(),
				]);
				throw runtimeFailure("Redirection-host certificate creation failed", error, rollbackResults);
			}
		}

		// re-fetch with cert
		row = await internalRedirectionHost.get(access, {
			id: row.id,
			expand: ["certificate", "owner"],
		});

		try {
			await internalNginx.configure(redirectionHostModel, "redirection_host", row);
		} catch (error) {
			const rollbackResults = await Promise.allSettled([
				redirectionHostModel.query().deleteById(row.id),
				createdCertificateId
					? internalCertificate.delete(access, { id: createdCertificateId })
					: Promise.resolve(),
			]);
			throw runtimeFailure("Redirection-host creation failed", error, rollbackResults);
		}

		thisData.meta = _.assign({}, thisData.meta || {}, row.meta);

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "redirection-host",
			object_id: row.id,
			meta: thisData,
		});

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("redirection-host");

		return row;
	},

	/**
	 * @param  {import("../lib/types.js").Access}  access
	 * @param  {Object}  data
	 * @param  {number}  data.id
	 * @param  {Array<string>} [data.domain_names]
	 * @param  {string}  [data.forward_scheme]
	 * @param  {string}  [data.forward_domain_name]
	 * @param  {number}  [data.forward_http_code]
	 * @param  {boolean} [data.preserve_path]
	 * @param  {number|string}  [data.certificate_id]
	 * @param  {boolean} [data.ssl_forced]
	 * @param  {boolean} [data.hsts_enabled]
	 * @param  {boolean} [data.hsts_subdomains]
	 * @param  {boolean} [data.http2_support]
	 * @param  {boolean} [data.block_exploits]
	 * @param  {string}  [data.advanced_config]
	 * @param  {Object}  [data.meta]
	 * @return {Promise}
	 */
	update: async (access, data, options = {}) => {
		let thisData = /** @type {any} */ (data || {});
		const createCertificate = thisData.certificate_id === "new";
		let createdCertificateId = null;

		if (createCertificate) {
			delete thisData.certificate_id;
		}

		await access.can("redirection_hosts:update", thisData.id);
		let row = await internalRedirectionHost.get(access, { id: thisData.id });
		const snapshot = await redirectionHostModel.query().findById(thisData.id).where("is_deleted", 0);

		if (row.id !== thisData.id) {
			throw new errs.InternalValidationError(
				`Redirection Host could not be updated, IDs do not match: ${row.id} !== ${thisData.id}`,
			);
		}

		// Get a list of the domain names and check each of them against existing records
		const domain_name_check_promises = [];

		if (typeof thisData.domain_names !== "undefined") {
			thisData.domain_names.map((domain_name) => {
				domain_name_check_promises.push(internalHost.isHostnameTaken(domain_name, "redirection", thisData.id));
				return true;
			});

			const check_results = await Promise.all(domain_name_check_promises);
			check_results.map((result) => {
				if (result.is_taken) {
					throw new errs.ValidationError(`${result.hostname} is already in use`);
				}
				return true;
			});
		}

		if (createCertificate) {
			const cert = await internalCertificate.createQuickCertificate(access, {
				domain_names: thisData.domain_names || row.domain_names,
				meta: _.assign({}, row.meta, thisData.meta),
			});
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

		await redirectionHostModel
			.query()
			.patchAndFetchById(thisData.id, /** @type {any} */ (thisData))
			.then(/** @type {any} */ (utils.omitRow(omissions()))); // Ensure we omit rows here if needed, though patchAndFetchById returns object

		row = await internalRedirectionHost.get(access, {
			id: thisData.id,
			expand: ["owner", "certificate"],
		});

		if (!options.skip_configure) {
			try {
				const newMeta = await internalNginx.configure(redirectionHostModel, "redirection_host", row);
				row.meta = newMeta;
			} catch (error) {
				const rollbackResults = await Promise.allSettled([
					redirectionHostModel
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
							internalRedirectionHost
								.get(access, { id: row.id, expand: ["owner", "certificate"] })
								.then((restored) =>
									internalNginx.configure(redirectionHostModel, "redirection_host", restored),
								),
						])),
					);
				}
				throw runtimeFailure("Redirection-host update failed", error, rollbackResults);
			}
		}

		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "redirection-host",
			object_id: row.id,
			meta: thisData,
		});

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("redirection-host");

		return _.omit(internalHost.cleanRowCertificateMeta(row), omissions());
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

		const access_data = await access.can("redirection_hosts:get", thisData.id);

		const query = redirectionHostModel
			.query()
			.where("is_deleted", 0)
			.andWhere("id", thisData.id)
			.allowGraph("[owner,certificate]")
			.first();

		if (access_data.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
			query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
		}

		let row = await query;
		row = utils.omitRow(omissions())(row);

		if (!row?.id) {
			throw new errs.ItemNotFoundError(thisData.id);
		}
		row = internalHost.cleanRowCertificateMeta(row);
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
		await access.can("redirection_hosts:delete", data.id);
		const row = await internalRedirectionHost.get(access, { id: data.id });

		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}

		try {
			await redirectionHostModel.query().where("id", row.id).patch({ is_deleted: 1 });
			await internalNginx.deleteConfig("redirection_host", row);
		} catch (error) {
			const rollbackResults = await Promise.allSettled([
				redirectionHostModel.query().findById(row.id).patch({ is_deleted: 0 }),
				internalNginx.configure(redirectionHostModel, "redirection_host", row),
			]);
			throw runtimeFailure("Redirection-host deletion failed", error, rollbackResults);
		}

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "redirection-host",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("redirection-host");

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
		await access.can("redirection_hosts:update", data.id);
		const row = await internalRedirectionHost.get(access, {
			id: data.id,
			expand: ["certificate", "owner"],
		});

		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		if (row.enabled) {
			throw new errs.ValidationError("Host is already enabled");
		}

		row.enabled = 1;

		try {
			await redirectionHostModel.query().where("id", row.id).patch({ enabled: 1 });
			await internalNginx.configure(redirectionHostModel, "redirection_host", row);
		} catch (error) {
			const rollbackResults = await Promise.allSettled([
				redirectionHostModel.query().findById(row.id).patch({ enabled: 0 }),
				internalNginx.deleteConfig("redirection_host", row),
			]);
			throw runtimeFailure("Redirection-host enable failed", error, rollbackResults);
		}

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "enabled",
			object_type: "redirection-host",
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
		await access.can("redirection_hosts:update", data.id);
		const row = await internalRedirectionHost.get(access, { id: data.id });

		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		if (!row.enabled) {
			throw new errs.ValidationError("Host is already disabled");
		}

		row.enabled = 0;

		try {
			await redirectionHostModel.query().where("id", row.id).patch({ enabled: 0 });
			await internalNginx.deleteConfig("redirection_host", row);
		} catch (error) {
			const rollbackResults = await Promise.allSettled([
				redirectionHostModel.query().findById(row.id).patch({ enabled: 1 }),
				internalNginx.configure(redirectionHostModel, "redirection_host", { ...row, enabled: 1 }),
			]);
			throw runtimeFailure("Redirection-host disable failed", error, rollbackResults);
		}

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "disabled",
			object_type: "redirection-host",
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
	 * @param   {String}  [search_query]
	 * @returns {Promise}
	 */
	getAll: async (access, expand, search_query) => {
		const access_data = await access.can("redirection_hosts:list");

		const query = redirectionHostModel
			.query()
			.where("is_deleted", 0)
			.groupBy("id")
			.allowGraph("[owner,certificate]")
			.orderBy(castJsonIfNeed("domain_names"), "ASC");

		if (access_data.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		// Query is used for searching
		if (typeof search_query === "string" && search_query.length > 0) {
			query.where(function () {
				this.where(castJsonIfNeed("domain_names"), "like", `%${search_query}%`);
			});
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		let rows = await query;
		rows = utils.omitRows(omissions())(rows);

		if (typeof expand !== "undefined" && expand !== null && expand.indexOf("certificate") !== -1) {
			return internalHost.cleanAllRowsCertificateMeta(rows);
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
		const query = redirectionHostModel.query().count("id as count").where("is_deleted", 0);

		if (visibility !== "all") {
			query.andWhere("owner_user_id", user_id);
		}

		const row = await query.first();
		return Number.parseInt(/** @type {any} */ (row).count, 10);
	},
};

export default internalRedirectionHost;
