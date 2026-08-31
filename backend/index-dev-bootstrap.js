#!/usr/bin/env node

process.env.DATA_PATH ||= `${process.cwd()}/data`;
process.env.INITIAL_DEFAULT_PAGE ||= "congratulations";

await import("./index-dev.js");
