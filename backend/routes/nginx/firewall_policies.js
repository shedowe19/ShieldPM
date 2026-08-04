import express from "express";
import internalFirewallPolicy from "../../internal/firewall-policy.js";
import { isDemoMode } from "../../lib/config.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import apiValidator from "../../lib/validator/api.js";
import { getValidationSchema } from "../../schema/index.js";

const router = express.Router({ caseSensitive: true, strict: true, mergeParams: true });

router.use(jwtdecode());
router.use((req, res, next) => {
	if (isDemoMode() && req.method !== "GET") {
		res.status(403).send({ error: "Firewall Policies are disabled in Demo Mode" });
		return;
	}
	next();
});

router
	.route("/")
	.options((_req, res) => res.sendStatus(204))
	.get(async (_req, res, next) => {
		try {
			res.status(200).send(await internalFirewallPolicy.getAll(res.locals.access));
		} catch (error) {
			next(error);
		}
	})
	.post(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/nginx/firewall-policies", "post"), req.body);
			res.status(201).send(await internalFirewallPolicy.create(res.locals.access, payload));
		} catch (error) {
			next(error);
		}
	});

router
	.route("/:id")
	.options((_req, res) => res.sendStatus(204))
	.get(async (req, res, next) => {
		try {
			res.status(200).send(await internalFirewallPolicy.get(res.locals.access, Number(req.params.id)));
		} catch (error) {
			next(error);
		}
	})
	.put(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/nginx/firewall-policies/{id}", "put"), req.body);
			res.status(200).send(
				await internalFirewallPolicy.update(res.locals.access, Number(req.params.id), payload),
			);
		} catch (error) {
			next(error);
		}
	})
	.delete(async (req, res, next) => {
		try {
			await internalFirewallPolicy.delete(res.locals.access, Number(req.params.id));
			res.status(200).send(true);
		} catch (error) {
			next(error);
		}
	});

router.post("/:id/refresh", async (req, res, next) => {
	try {
		res.status(200).send(await internalFirewallPolicy.refresh(res.locals.access, Number(req.params.id)));
	} catch (error) {
		next(error);
	}
});

export default router;
