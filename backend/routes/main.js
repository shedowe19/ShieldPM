import express from "express";
import { isDemoMode } from "../lib/config.js";
import errs from "../lib/error.js";
import pjson from "../package.json" with { type: "json" };
import { isSetup } from "../setup.js";
import twoFaRoutes from "./2fa.js";
import aiRoutes from "./ai.js";
import analyticsRoutes from "./analytics.js";
import auditLogRoutes from "./audit-log.js";
import chatRoutes from "./chat.js";
import dashboardRoutes from "./dashboard.js";
import gitopsRoutes from "./gitops.js";
import accessListsRoutes from "./nginx/access_lists.js";
import nginxAnalyticsRoutes from "./nginx/analytics.js";
import certificatesHostsRoutes from "./nginx/certificates.js";
import cloudflaredRoutes from "./nginx/cloudflared.js";
import ddnsProvidersRoutes from "./nginx/ddns_providers.js";
import firewallPoliciesRoutes from "./nginx/firewall_policies.js";
import deadHostsRoutes from "./nginx/dead_hosts.js";
import proxyHostsRoutes from "./nginx/proxy_hosts.js";
import redirectionHostsRoutes from "./nginx/redirection_hosts.js";
import streamsRoutes from "./nginx/streams.js";
import torOnionRoutes from "./nginx/tor_onion.js";
import wireguardRoutes from "./nginx/wireguard.js";
import oidcRoutes from "./oidc.js";
import reportsRoutes from "./reports.js";
import schemaRoutes from "./schema.js";
import servicesRoutes from "./services.js";
import settingsRoutes from "./settings.js";
import tokensRoutes from "./tokens.js";
import usersRoutes from "./users.js";
import versionRoutes from "./version.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * Health Check
 * GET /api
 */
router.get("/", async (_, res /*, next*/) => {
	const version = pjson.version;
	const setup = await isSetup();

	res.status(200).send({
		status: "OK",
		setup,
		version,
		demo: isDemoMode(),
		csrfToken: res.locals.csrfToken,
	});
});

router.use("/schema", schemaRoutes);
router.use("/tokens", tokensRoutes);
router.use("/oidc", oidcRoutes);
router.use("/users", usersRoutes);
router.use("/users/:user_id/2fa", twoFaRoutes);
router.use("/audit-log", auditLogRoutes);
router.use("/reports", reportsRoutes);
router.use("/settings", settingsRoutes);
router.use("/version", versionRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/ai", aiRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/chat", chatRoutes);
router.use("/nginx/proxy-hosts", proxyHostsRoutes);
router.use("/nginx/ddns-providers", ddnsProvidersRoutes);
router.use("/nginx/firewall-policies", firewallPoliciesRoutes);
router.use("/nginx/redirection-hosts", redirectionHostsRoutes);
router.use("/nginx/dead-hosts", deadHostsRoutes);
router.use("/nginx/streams", streamsRoutes);
router.use("/nginx/access-lists", accessListsRoutes);
router.use("/nginx/certificates", certificatesHostsRoutes);
router.use("/nginx/analytics", nginxAnalyticsRoutes);
router.use("/nginx/cloudflared-tunnels", cloudflaredRoutes);
router.use("/nginx/tor-onion", torOnionRoutes);
router.use("/nginx/wireguard", wireguardRoutes);
router.use("/gitops", gitopsRoutes);
router.use("/services", servicesRoutes);

/**
 * API 404 for all other routes
 *
 * ALL /api/*
 */
router.all(/(.+)/, (req, _, next) => {
	req.params.page = req.params["0"];
	next(new errs.ItemNotFoundError(req.params.page));
});

export default router;
