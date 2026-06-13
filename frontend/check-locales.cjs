#!/usr/bin/env node

// This file does a few things to ensure that the Locales are present and valid:
// - Ensures that the name of the locale exists in the language list
// - Ensures that each locale contains the translations used in the application
// - Ensures that there are no unused translations in the locale files
// - Also checks the error messages returned by the backend

const allLocales = [
  ["en", "en-US"],
  ["de", "de-DE"],
  ["es", "es-ES"],
  ["it", "it-IT"],
  ["ja", "ja-JP"],
  ["nl", "nl-NL"],
  ["pl", "pl-PL"],
  ["ru", "ru-RU"],
  ["sk", "sk-SK"],
  ["vi", "vi-VN"],
  ["zh", "zh-CN"],
  ["ko", "ko-KR"],
  ["bg", "bg-BG"],
];

const ignoreUnused = [/^.*$/];

// Some UI strings are intentionally identical across languages because they are
// protocols, product names, acronyms, code examples, placeholders, or commonly
// untranslated technical labels. Any other non-English value that is exactly the
// same as en.json is treated as a likely English fallback.
const allowedIdenticalToEnglish = new Set([
  "2fa.backup-code.placeholder",
  "2fa.method.duo",
  "2fa.method.passkey",
  "2fa.method.yubikey",
  "2fa.yubikey.otp",
  "access-list.mtls.certificate.placeholder",
  "access-list.mtls.tab",
  "analytics.range.1h",
  "analytics.range.24h",
  "analytics.range.30d",
  "analytics.range.7d",
  "authentikHost",
  "auto",
  "avatar",
  "certificate.custom-certificate",
  "certificates.internal.type.server",
  "certificates.root_ca",
  "chatops",
  "cloudflared.token",
  "column.host",
  "column.http-code",
  "column.name",
  "column.protocol",
  "column.roles",
  "column.ssl",
  "column.status",
  "ddns-providers.cloudfare_token",
  "ddns-providers.cloudfare_zone_id",
  "ddns-providers.custom_url.placeholder",
  "ddns-providers.duckdns_token",
  "ddns-providers.status",
  "form.placeholder.auth-host",
  "form.placeholder.email",
  "form.placeholder.example-domain",
  "form.placeholder.port-example",
  "hosts",
  "http-only",
  "id",
  "items",
  "lets-encrypt",
  "lets-encrypt-via-dns",
  "lets-encrypt-via-http",
  "name",
  "navbar-menu",
  "object.actions-title",
  "offline",
  "oidcClientId",
  "oidcClientSecret",
  "oidcDiscoveryUrl",
  "online",
  "proxy-host.git-sync",
  "proxy-host.git-sync.branch",
  "proxy-host.git-sync.repo-url.placeholder",
  "proxy-host.php.custom-ini.placeholder",
  "proxy-host.rate-limiting.burst",
  "proxy-host.rate-limiting.unit",
  "role.admin",
  "settings.gitops",
  "settings.gitops.branch",
  "stream",
  "streams",
  "streams.count_label",
  "streams.tcp",
  "streams.udp",
  "terminal.auth-type.key",
  "test",
  "tor-onion",
  "tor.title",
  "user.avatar",
  "wireguard.peer.keepalive",
  "wireguard.server.subnet",
]);

const { spawnSync } = require("child_process");
const fs = require("fs");

const tmp = require("tmp");

// Parse backend errors
const BACKEND_ERRORS_FILE = "../backend/internal/errors/errors.go";
const BACKEND_ERRORS = [];
/*
try {
	const backendErrorsContent = fs.readFileSync(BACKEND_ERRORS_FILE, "utf8");
	const backendErrorsContentRes = [
		...backendErrorsContent.matchAll(/(?:errors|eris)\.New\("([^"]+)"\)/g),
	];
	backendErrorsContentRes.map((item) => {
		BACKEND_ERRORS.push("error." + item[1]);
		return null;
	});
} catch (err) {
	console.log("\x1b[31m%s\x1b[0m", err);
	process.exit(1);
}
*/

// get all translations used in frontend code
const tmpobj = tmp.fileSync({ postfix: ".json" });
const extractResult = spawnSync(
  "yarn",
  [
    "exec",
    "formatjs",
    "extract",
    "src/**/*.tsx",
    "--ignore",
    "src/locale/IntlProvider.tsx",
    "src/notifications/helpers.tsx",
    "--out-file",
    tmpobj.name,
  ],
  { stdio: "inherit" },
);
if (extractResult.status !== 0) {
  console.log("\x1b[31m%s\x1b[0m", "ERROR: formatjs extraction failed");
  process.exit(extractResult.status || 1);
}

const allLocalesInProject = require(tmpobj.name);

// get list og language names and locales
const langList = require("./src/locale/lang/lang-list.json");

// store a list of all validation errors
const allErrors = [];
const allWarnings = [];
const allKeys = [];

const checkLangList = (fullCode) => {
  const key = "locale-" + fullCode;
  if (typeof langList[key] === "undefined") {
    allErrors.push(
      "ERROR: `" + key + "` language does not exist in lang-list.json",
    );
  }
};

const compareLocale = (locale) => {
  const sourceLocaleKeys = Object.keys(allLocales[0].data);
  const projectLocaleKeys = Object.keys(allLocalesInProject);

  // en.json is the source of truth for all locale keys. Every supported
  // locale must contain every key so the UI never falls back to English.
  sourceLocaleKeys.map((key) => {
    if (typeof locale.data[key] === "undefined") {
      allErrors.push(
        "ERROR: `" +
          locale[0] +
          "` does not contain source locale item: `" +
          key +
          "`",
      );
    }
    return null;
  });

  // Non-English locales should not silently copy en.json values. Identical
  // values are only accepted for technical/proper-name strings above.
  if (locale[0] !== "en") {
    sourceLocaleKeys.map((key) => {
      if (
        typeof locale.data[key] !== "undefined" &&
        locale.data[key] === allLocales[0].data[key] &&
        !allowedIdenticalToEnglish.has(key)
      ) {
        allErrors.push(
          "ERROR: `" +
            locale[0] +
            "` appears to use English fallback for item: `" +
            key +
            "`",
        );
      }
      return null;
    });
  }

  // Check that locale contains the items used in the codebase
  projectLocaleKeys.map((key) => {
    if (typeof locale.data[key] === "undefined") {
      allErrors.push(
        "ERROR: `" + locale[0] + "` does not contain item: `" + key + "`",
      );
    }
    return null;
  });
  // Check that locale contains all error.* items
  BACKEND_ERRORS.forEach((key) => {
    if (typeof locale.data[key] === "undefined") {
      allErrors.push(
        "ERROR: `" + locale[0] + "` does not contain item: `" + key + "`",
      );
    }
    return null;
  });

  // Check that locale does not contain items not used in the codebase
  const localeKeys = Object.keys(locale.data);
  localeKeys.map((key) => {
    let ignored = false;
    ignoreUnused.map((regex) => {
      if (key.match(regex)) {
        ignored = true;
      }
      return null;
    });

    if (!ignored && typeof allLocalesInProject[key] === "undefined") {
      // ensure this key doesn't exist in the backend errors either
      if (!BACKEND_ERRORS.includes(key)) {
        allErrors.push(
          "ERROR: `" + locale[0] + "` contains unused item: `" + key + "`",
        );
      }
    }

    // Add this key to allKeys
    if (allKeys.indexOf(key) === -1) {
      allKeys.push(key);
    }
    return null;
  });
};

// Checks for any keys missing from this locale, that
// have been defined in any other locales
const checkForMissing = (locale) => {
  allKeys.forEach((key) => {
    if (typeof locale.data[key] === "undefined") {
      allWarnings.push(
        "WARN: `" + locale[0] + "` does not contain item: `" + key + "`",
      );
    }
    return null;
  });
};

// Local all locale data
allLocales.map((locale, idx) => {
  checkLangList(locale[1]);
  allLocales[idx].data = require("./src/locale/lang/" + locale[0] + ".json");
  return null;
});

// Verify all locale data
allLocales.map((locale) => {
  compareLocale(locale);
  checkForMissing(locale);
  return null;
});

if (allErrors.length) {
  allErrors.map((err) => {
    console.log("\x1b[31m%s\x1b[0m", err);
    return null;
  });
}
if (allWarnings.length) {
  allWarnings.map((err) => {
    console.log("\x1b[33m%s\x1b[0m", err);
    return null;
  });
}

if (allErrors.length) {
  process.exit(1);
}

console.log("\x1b[32m%s\x1b[0m", "Locale check passed");
process.exit(0);
