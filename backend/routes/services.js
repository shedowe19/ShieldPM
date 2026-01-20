import express from "express";
import jwtdecode from "../lib/express/jwt-decode.js";
import { getAllServices, detectService, getIconUrl } from "../lib/service-icons.js";

const router = express.Router({
    caseSensitive: true,
    strict: true,
    mergeParams: true,
});

/**
 * GET /api/services/icons
 * Returns list of all available service icons for picker/autocomplete
 */
router.get("/icons", jwtdecode(), (req, res) => {
    res.json(getAllServices());
});

/**
 * GET /api/services/detect
 * Detects service based on port and hostname
 * Query params: port (required), hostname (optional)
 */
router.get("/detect", jwtdecode(), (req, res) => {
    const { port, hostname } = req.query;

    if (!port) {
        return res.status(400).json({ error: "Port is required" });
    }

    const parsedPort = Number.parseInt(port, 10);
    if (Number.isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
        return res.status(400).json({ error: "Invalid port number" });
    }

    const service = detectService(parsedPort, hostname || "");
    if (service) {
        res.json({
            name: service.name,
            displayName: service.displayName,
            iconUrl: getIconUrl(service.name),
        });
    } else {
        res.json(null);
    }
});

export default router;
