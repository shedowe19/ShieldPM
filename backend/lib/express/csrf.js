import crypto from "crypto";

/**
 * CSRF Protection Middleware using Double Submit Cookie Pattern
 * 
 * 1. Checks for XSRF-TOKEN cookie.
 * 2. If missing, generates a new one and sets it.
 * 3. for unsafe methods, verifies header matches cookie.
 */
const csrfMiddleware = () => {
    return (req, res, next) => {
        const cookieName = "XSRF-TOKEN";
        const headerName = "X-XSRF-TOKEN";

        // 1. Get existing token from cookie
        let token = req.cookies[cookieName];

        // 2. If no token, generate one
        if (!token) {
            token = crypto.randomBytes(32).toString("hex");
            res.cookie(cookieName, token, {
                httpOnly: false, // Must be readable by frontend JS
                sameSite: "strict",
                secure: req.secure || req.headers["x-forwarded-proto"] === "https",
            });
        }

        // 3. For safe methods, just proceed (token is set/refreshed)
        if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
            return next();
        }

        // 4. For unsafe methods, verify header matches token
        const headerToken = req.headers[headerName.toLowerCase()] || req.headers[headerName];

        if (!headerToken || headerToken !== token) {
            return res.status(403).json({
                error: {
                    message: "CSRF Validation Failed",
                    code: "csrf_error"
                }
            });
        }

        next();
    };
};

export default csrfMiddleware;
