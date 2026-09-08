import fs from "node:fs";
import _ from "lodash";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import { sanitizeHostMeta } from "../lib/host-response.js";
import utils from "../lib/utils.js";
import streamModel from "../models/stream.js";
import internalAuditLog from "./audit-log.js";
import internalCertificate from "./certificate.js";
import internalGitOps from "./gitops.js";
import internalHost from "./host.js";
import internalNginx from "./nginx.js";

const omissions = () => {
	return ["is_deleted", "owner.is_deleted", "certificate.is_deleted"];
};

/** Parse and validate an incoming port or inclusive port range. */
const incomingPortRange = (value) => {
	const text = String(value);
	if (!/^\d{1,5}(?:-\d{1,5})?$/.test(text)) {
		throw new errs.ValidationError("Incoming port must be a port or port range");
	}
	const [start, last] = text.split("-").map(Number);
	const end = last ?? start;
	if (start < 1 || end > 65535 || end < start) {
		throw new errs.ValidationError("Incoming ports must be within 1-65535 and ranges must be ascending");
	}
	return [start, end];
};

/** Detect overlapping listeners for the requested protocols across all owners. */
const findPortCollision = async (incomingPort, tcpForwarding, udpForwarding, ignoredId) => {
	const [start, end] = incomingPortRange(incomingPort);
	const streams = await streamModel
		.query()
		.where("is_deleted", 0)
		.select("id", "incoming_port", "tcp_forwarding", "udp_forwarding");
	return streams.find((stream) => {
		if (
			stream.id === ignoredId ||
			!((tcpForwarding && stream.tcp_forwarding) || (udpForwarding && stream.udp_forwarding))
		) {
			return false;
		}
		const [otherStart, otherEnd] = incomingPortRange(stream.incoming_port);
		return start <= otherEnd && otherStart <= end;
	});
};

const internalStream = {
	/**
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Object}  data
	 * @param   {number}  data.incoming_port
	 * @param   {boolean} data.tcp_forwarding
	 * @param   {boolean} data.udp_forwarding
	 * @param   {string|number} [data.certificate_id]
	 * @param   {Object}  [data.meta]
	 * @param   {Array<string>} [data.domain_names]
	 * @param   {number}  [data.owner_user_id]
	 * @param   {string}  [data.forwarding_host]
	 * @param   {number}  [data.forwarding_port]
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		const create_certificate = data.certificate_id === "new";

		if (create_certificate) {
			if (!Array.isArray(data.domain_names) || data.domain_names.length === 0) {
				throw new errs.ValidationError("Domain names are required when requesting a new certificate");
			}
			delete data.certificate_id;
		}

		await access.can("streams:create", data);
		await internalHost.validateReferences(access, data);

		// Check for port collision
		const collision = await findPortCollision(data.incoming_port, data.tcp_forwarding, data.udp_forwarding);

		if (collision) {
			throw new errs.ValidationError(`Incoming port ${data.incoming_port} is already in use by another stream.`);
		}

		data.owner_user_id = access.token.getUserId(1);

		if (typeof data.meta === "undefined") {
			data.meta = {};
		}

		// streams aren't routed by domain name so don't store domain names in the DB
		const data_no_domains = structuredClone(data);
		delete data_no_domains.domain_names;
		data_no_domains.meta = sanitizeHostMeta(data_no_domains.meta);

		let row = await streamModel.query().insertAndFetch(/** @type {any} */ (data_no_domains));
		row = utils.omitRow(omissions())(row);

		if (create_certificate) {
			const cert = await internalCertificate.createQuickCertificate(access, /** @type {any} */ (data));
			// update host with cert id, skip nginx configure as we do it below
			await internalStream.update(
				access,
				{
					id: row.id,
					certificate_id: cert.id,
				},
				{ skip_configure: true },
			);
		}

		// re-fetch with cert
		row = await internalStream.get(access, {
			id: row.id,
			expand: ["certificate", "owner"],
		});

		// Configure nginx
		row.meta = await internalNginx.configure(streamModel, "stream", row);

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "stream",
			object_id: row.id,
			meta: { ...data, meta: sanitizeHostMeta(data.meta) },
		});

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("stream");

		return row;
	},

	/**
	 * @param  {import("../lib/types.js").Access}  access
	 * @param  {Object}  data
	 * @param  {number}  data.id
	 * @param  {number}  [data.incoming_port]
	 * @param  {boolean} [data.tcp_forwarding]
	 * @param  {boolean} [data.udp_forwarding]
	 * @param  {string|number} [data.certificate_id]
	 * @param  {Object}  [data.meta]
	 * @param  {Array<string>} [data.domain_names]
	 * @param  {string}  [data.forwarding_host]
	 * @param  {number}  [data.forwarding_port]
	 * @return {Promise}
	 */
	update: async (access, data, options = {}) => {
		let thisData = data;
		const create_certificate = thisData.certificate_id === "new";

		if (create_certificate) {
			if (!Array.isArray(thisData.domain_names) || thisData.domain_names.length === 0) {
				throw new errs.ValidationError("Domain names are required when requesting a new certificate");
			}
			delete thisData.certificate_id;
		}

		await access.can("streams:update", thisData.id);
		let row = await internalStream.get(access, { id: thisData.id });
		await internalHost.validateReferences(access, thisData, row);
		const incomingPort = thisData.incoming_port ?? row.incoming_port;
		const tcpForwarding = thisData.tcp_forwarding ?? row.tcp_forwarding;
		const udpForwarding = thisData.udp_forwarding ?? row.udp_forwarding;

		// Check for port collision (excluding self)
		const collision = await findPortCollision(incomingPort, tcpForwarding, udpForwarding, thisData.id);

		if (collision) {
			throw new errs.ValidationError(`Incoming port ${incomingPort} is already in use by another stream.`);
		}

		if (row.id !== thisData.id) {
			// Sanity check that something crazy hasn't happened
			throw new errs.InternalValidationError(
				`Stream could not be updated, IDs do not match: ${row.id} !== ${thisData.id}`,
			);
		}

		if (create_certificate) {
			const cert = await internalCertificate.createQuickCertificate(access, {
				domain_names: thisData.domain_names || row.domain_names,
				meta: _.assign({}, row.meta, thisData.meta),
			});
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

		// Domain names are only used for certificate requests, never stored on streams.
		if (thisData.meta) thisData.meta = sanitizeHostMeta(thisData.meta);
		const persistedData = _.omit(thisData, ["domain_names"]);
		let saved_row = await streamModel.query().patchAndFetchById(row.id, /** @type {any} */ (persistedData));

		saved_row = utils.omitRow(omissions())(saved_row);

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "stream",
			object_id: row.id,
			meta: thisData,
		});

		row = await internalStream.get(access, { id: thisData.id, expand: ["owner", "certificate"] });

		if (!options.skip_configure) {
			const new_meta = await internalNginx.configure(streamModel, "stream", row);
			row.meta = new_meta;
		}

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("stream");

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

		const access_data = await access.can("streams:get", thisData.id);

		const query = streamModel
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
		await access.can("streams:delete", data.id);
		const row = await internalStream.get(access, { id: data.id });

		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}

		await internalNginx.withConfigurationLock(async () => {
			const hadConfig = fs.existsSync(internalNginx.getConfigName("stream", row.id));
			await internalNginx.backupConfig("stream", row);
			try {
				await streamModel.transaction(async (trx) => {
					await streamModel.query(trx).where("id", row.id).patch({ is_deleted: 1 });
					await internalNginx.deleteConfig("stream", row);
					await internalNginx.reload();
				});
			} catch (error) {
				// The database transaction has rolled back. Restore the listener
				// before releasing the shared configuration lock.
				if (hadConfig) await internalNginx.restoreConfig("stream", row);
				await internalNginx.reload();
				throw error;
			}
			await internalNginx.deleteBackupConfig("stream", row);
		});

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "stream",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("stream");

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
		await access.can("streams:update", data.id);
		const row = await internalStream.get(access, {
			id: data.id,
			expand: ["certificate", "owner"],
		});

		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		if (row.enabled) {
			throw new errs.ValidationError("Stream is already enabled");
		}

		row.enabled = 1;

		await streamModel
			.query()
			.where("id", row.id)
			.patch(
				/** @type {any} */ ({
					enabled: 1,
				}),
			);

		// Configure nginx
		row.meta = await internalNginx.configure(streamModel, "stream", row);

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "enabled",
			object_type: "stream",
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
		await access.can("streams:update", data.id);
		const row = await internalStream.get(access, { id: data.id });

		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		if (!row.enabled) {
			throw new errs.ValidationError("Stream is already disabled");
		}

		row.enabled = 0;

		await internalNginx.withConfigurationLock(async () => {
			const hadConfig = fs.existsSync(internalNginx.getConfigName("stream", row.id));
			await internalNginx.backupConfig("stream", row);
			try {
				await streamModel.transaction(async (trx) => {
					await streamModel.query(trx).where("id", row.id).patch({ enabled: 0 });
					await internalNginx.deleteConfig("stream", row);
					await internalNginx.reload();
				});
			} catch (error) {
				// The database transaction has rolled back. Restore the listener
				// before releasing the shared configuration lock.
				if (hadConfig) await internalNginx.restoreConfig("stream", row);
				await internalNginx.reload();
				throw error;
			}
			await internalNginx.deleteBackupConfig("stream", row);
		});

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "disabled",
			object_type: "stream",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});

		return true;
	},

	/**
	 * All Streams
	 *
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [search_query]
	 * @returns {Promise}
	 */
	getAll: async (access, expand, search_query) => {
		const access_data = await access.can("streams:list");

		const query = streamModel
			.query()
			.where("is_deleted", 0)
			.groupBy("id")
			.allowGraph("[owner,certificate]")
			.orderBy("incoming_port", "ASC");

		if (access_data.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		// Query is used for searching
		if (typeof search_query === "string" && search_query.length > 0) {
			query.where(function () {
				this.where(castJsonIfNeed("incoming_port"), "like", `%${search_query}%`);
			});
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		let rows = await query;
		rows = utils.omitRows(omissions())(rows);

		return internalHost.cleanAllRowsCertificateMeta(rows);
	},

	/**
	 * Report use
	 *
	 * @param   {Number}  user_id
	 * @param   {String}  visibility
	 * @returns {Promise}
	 */
	getCount: async (user_id, visibility) => {
		const query = streamModel.query().count("id AS count").where("is_deleted", 0);

		if (visibility !== "all") {
			query.andWhere("owner_user_id", user_id);
		}

		const row = await query.first();
		return Number.parseInt(/** @type {any} */ (row).count, 10);
	},
};

export default internalStream;
