#!/usr/bin/env node

import { prepareDatabaseStartup } from "./bootstrap-app.js";

await prepareDatabaseStartup();
await import("./runtime.js");
