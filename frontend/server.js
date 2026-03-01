import express from "express";
import compression from "compression";
import { renderPage } from "vike/server";
import { createServer as createViteServer } from "vite";

const isProduction = process.env.NODE_ENV === "production";
const port = process.env.PORT || 5173;

async function startServer() {
	const app = express();
	app.use(compression());

	if (isProduction) {
		// Serve built assets
		app.use(express.static("dist/client"));
	} else {
		// Dev: use Vite middleware
		const vite = await createViteServer({
			server: { middlewareMode: true },
		});
		app.use(vite.middlewares);
	}

	// SSR handler
	app.get("*", async (req, res, next) => {
		const pageContextInit = { urlOriginal: req.originalUrl };
		const pageContext = await renderPage(pageContextInit);

		if (pageContext.httpResponse) {
			const { body, statusCode, headers } = pageContext.httpResponse;
			headers.forEach(([name, value]) => res.setHeader(name, value));
			res.status(statusCode).send(body);
		} else {
			next();
		}
	});

	app.listen(port, () => {
		console.log(`Server running at http://localhost:${port}`);
	});
}

startServer();
