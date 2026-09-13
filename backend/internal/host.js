import _ from "lodash";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import { sanitizeHostMeta } from "../lib/host-response.js";
import deadHostModel from "../models/dead_host.js";
import proxyHostModel from "../models/proxy_host.js";
import redirectionHostModel from "../models/redirection_host.js";

const internalHost = {
	/** Validate newly assigned resources with their own read permissions and owner scope. */
	validateReferences: async (access, data, existing = {}) => {
		if (data.certificate_id && data.certificate_id !== "new" && data.certificate_id !== existing.certificate_id) {
			const { default: internalCertificate } = await import("./certificate.js");
			await internalCertificate.get(access, { id: data.certificate_id });
		}
		if (data.access_list_id && data.access_list_id !== existing.access_list_id) {
			const { default: internalAccessList } = await import("./access-list.js");
			await internalAccessList.get(access, { id: data.access_list_id });
		}
	},
	/** A domain is one Nginx server_name token, never a directive or comment. */
	validateDomainNames: (domains) => {
		if (
			!Array.isArray(domains) ||
			domains.length < 1 ||
			domains.length > 99 ||
			domains.some((domain) => typeof domain !== "string" || !domain.length || /[\s\p{Cc};{}"'#]/u.test(domain))
		) {
			throw new errs.ValidationError(
				"Domain names must be nonempty Nginx server names without whitespace or directives",
			);
		}
		return domains;
	},
	/**
	 * Makes sure that the ssl_* and hsts_* fields play nicely together.
	 * ie: if there is no cert, then force_ssl is off.
	 *     if force_ssl is off, then hsts_enabled is definitely off.
	 *
	 * @template {{certificate_id?: number|string, ssl_forced?: boolean|number, hsts_enabled?: boolean|number, hsts_subdomains?: boolean|number}} T
	 * @param   {boolean} newCert
	 * @param   {T} data
	 * @param   {Partial<T>} [existingData]
	 * @returns {T}
	 */
	cleanSslHstsData: (newCert, data, existingData) => {
		const combinedData = _.assign({}, existingData || {}, data);

		if (!combinedData.certificate_id && !newCert) {
			combinedData.hsts_subdomains = false;
			combinedData.ssl_forced = false;
		}

		if (!combinedData.ssl_forced) {
			combinedData.hsts_enabled = false;
		}

		return combinedData;
	},

	/**
	 * used by the getAll functions of hosts, this removes the certificate meta if present
	 *
	 * @param   {Array}  rows
	 * @returns {Array}
	 */
	cleanAllRowsCertificateMeta: (rows) => {
		rows.map((_, idx) => {
			if (rows[idx].meta) rows[idx].meta = sanitizeHostMeta(rows[idx].meta);
			if (typeof rows[idx].certificate !== "undefined" && rows[idx].certificate) {
				rows[idx].certificate.meta = {};
			}
			return true;
		});

		return rows;
	},

	/**
	 * used by the get/update functions of hosts, this removes the certificate meta if present
	 *
	 * @param   {Object}  row
	 * @returns {Object}
	 */
	cleanRowCertificateMeta: (row) => {
		if (row.meta) row.meta = sanitizeHostMeta(row.meta);
		if (typeof row.certificate !== "undefined" && row.certificate) {
			row.certificate.meta = {};
		}

		return row;
	},

	/**
	 * This returns all the host types with any domain listed in the provided domainNames array.
	 * This is used by the certificates to temporarily disable any host that is using the domain
	 *
	 * @param   {Array}  domainNames
	 * @returns {Promise}
	 */
	getHostsWithDomains: async (domainNames) => {
		const responseObject = {
			total_count: 0,
			dead_hosts: [],
			proxy_hosts: [],
			redirection_hosts: [],
		};

		const [proxyRes, redirRes, deadRes] = await Promise.all([
			proxyHostModel.query().where("is_deleted", 0).withGraphFetched("host_domains"),
			redirectionHostModel.query().where("is_deleted", 0),
			deadHostModel.query().where("is_deleted", 0),
		]);

		responseObject.proxy_hosts = internalHost._getHostsWithDomains(proxyRes, domainNames);
		responseObject.total_count += responseObject.proxy_hosts.length;

		responseObject.redirection_hosts = internalHost._getHostsWithDomains(redirRes, domainNames);
		responseObject.total_count += responseObject.redirection_hosts.length;

		responseObject.dead_hosts = internalHost._getHostsWithDomains(deadRes, domainNames);
		responseObject.total_count += responseObject.dead_hosts.length;

		return responseObject;
	},

	/**
	 * Internal use only, checks to see if the domain is already taken by any other record
	 *
	 * @param   {String}   hostname
	 * @param   {String}   [ignore_type]   'proxy', 'redirection', 'dead'
	 * @param   {number}  [ignore_id]     Must be supplied if type was also supplied
	 * @returns {Promise}
	 */
	isHostnameTaken: async (hostname, ignore_type, ignore_id) => {
		const promises = [
			proxyHostModel
				.query()
				.where("is_deleted", 0)
				.whereExists(proxyHostModel.relatedQuery("host_domains").whereILike("domain_name", hostname))
				.withGraphFetched("host_domains"),
			redirectionHostModel
				.query()
				.where("is_deleted", 0)
				.whereILike(castJsonIfNeed("domain_names"), `%${hostname}%`),
			deadHostModel.query().where("is_deleted", 0).whereILike(castJsonIfNeed("domain_names"), `%${hostname}%`),
		];

		const promises_results = await Promise.all(promises);
		let is_taken = false;

		if (promises_results[0]) {
			// Proxy Hosts
			if (
				internalHost._checkHostnameRecordsTaken(
					hostname,
					promises_results[0],
					ignore_type === "proxy" && ignore_id ? ignore_id : 0,
				)
			) {
				is_taken = true;
			}
		}

		if (promises_results[1]) {
			// Redirection Hosts
			if (
				internalHost._checkHostnameRecordsTaken(
					hostname,
					promises_results[1],
					ignore_type === "redirection" && ignore_id ? ignore_id : 0,
				)
			) {
				is_taken = true;
			}
		}

		if (promises_results[2]) {
			// Dead Hosts
			if (
				internalHost._checkHostnameRecordsTaken(
					hostname,
					promises_results[2],
					ignore_type === "dead" && ignore_id ? ignore_id : 0,
				)
			) {
				is_taken = true;
			}
		}

		return {
			hostname: hostname,
			is_taken: is_taken,
		};
	},

	/**
	 * Private call only
	 *
	 * @param   {String}  hostname
	 * @param   {Array}   existingRows
	 * @param   {number} [ignoreId]
	 * @returns {Boolean}
	 */
	_checkHostnameRecordsTaken: (hostname, existingRows, ignoreId) => {
		const normalized = hostname.toLowerCase();
		return (existingRows || []).some(
			(row) => row.id !== ignoreId && row.domain_names.some((domain) => domain.toLowerCase() === normalized),
		);
	},

	/**
	 * Private call only
	 *
	 * @param   {Array}   hosts
	 * @param   {Array}   domainNames
	 * @returns {Array}
	 */
	_getHostsWithDomains: (hosts, domainNames) => {
		const domains = new Set(domainNames.map((domain) => domain.toLowerCase()));
		return (hosts || []).filter((host) => host.domain_names.some((domain) => domains.has(domain.toLowerCase())));
	},
};

export default internalHost;
