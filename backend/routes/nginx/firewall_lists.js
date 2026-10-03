import express from "express";
import internalFirewallList from "../../internal/firewall-list.js";
import errs from "../../lib/error.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import apiValidator from "../../lib/validator/api.js";
import { getValidationSchema } from "../../schema/index.js";

const router = express.Router({ caseSensitive: true, strict: true, mergeParams: true });
const listId = (req) => {
	const value = req.params.list_id;
	if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
		throw new errs.ValidationError("Invalid firewall list ID");
	}
	return Number(value);
};

router
	.route("/")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (_, res) => res.status(200).send(await internalFirewallList.getAll(res.locals.access)))
	.post(async (req, res) => {
		const payload = await apiValidator(getValidationSchema("/nginx/firewall-lists", "post"), req.body);
		res.status(201).send(await internalFirewallList.create(res.locals.access, payload));
	});

// Register the named endpoint before the ID route.
router
	.route("/preview")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res) => {
		const payload = await apiValidator(getValidationSchema("/nginx/firewall-lists/preview", "post"), req.body);
		res.status(200).send(await internalFirewallList.preview(res.locals.access, payload));
	});

router
	.route("/:list_id/refresh")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res) => {
		await apiValidator(getValidationSchema("/nginx/firewall-lists/{listID}/refresh", "post"), req.body ?? {});
		res.status(200).send(await internalFirewallList.refresh(res.locals.access, { id: listId(req) }));
	});

router
	.route("/:list_id")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res) =>
		res.status(200).send(await internalFirewallList.get(res.locals.access, { id: listId(req) })),
	)
	.put(async (req, res) => {
		const payload = await apiValidator(getValidationSchema("/nginx/firewall-lists/{listID}", "put"), req.body);
		res.status(200).send(await internalFirewallList.update(res.locals.access, { ...payload, id: listId(req) }));
	})
	.delete(async (req, res) =>
		res.status(200).send(await internalFirewallList.delete(res.locals.access, { id: listId(req) })),
	);

export default router;
