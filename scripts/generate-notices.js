const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HEADER = `# Third-Party Notices

This project (ShieldPM) incorporates the following third-party components. The licenses are extracted directly from the NPM Registry API for the specified versions. This list includes both production dependencies and development dependencies from the backend and frontend package.json files.

For verification, each entry links to the NPM package page (e.g., https://www.npmjs.com/package/<package>/v/<version>), where the license can be confirmed in the package metadata. Note: Transitive dependencies (dependencies of dependencies) are not included, as this focuses on direct dependencies.
`;

const FOOTER = `
The above information is based solely on the NPM Registry data as of ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. For full license texts, refer to the respective package repositories or the NPM links provided.
`;

function getLicenses(cwd, production) {
    try {
        const type = production ? '--production' : '--development';
        // Use npx -y to avoid prompts
        const cmd = `npx -y license-checker --start . --json --direct ${type}`;
        console.log(`Running in ${cwd}: ${cmd}`);
        const output = execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return JSON.parse(output);
    } catch (e) {
        console.error(`Error getting licenses for ${cwd} (${production ? 'prod' : 'dev'}):`, e.message);
        return {};
    }
}

function formatDeps(deps) {
    const lines = [];
    const sortedKeys = Object.keys(deps).sort();

    for (const key of sortedKeys) {
        const pkg = deps[key];
        // Key is usually "name@version"
        const lastAt = key.lastIndexOf('@');
        const name = key.substring(0, lastAt);
        const version = key.substring(lastAt + 1);

        let license = pkg.licenses;
        if (Array.isArray(license)) license = license.join(' OR ');

        const npmLink = `https://www.npmjs.com/package/${name}/v/${version}`;
        lines.push(`- ${key} - ${license}[](${npmLink})`);
    }
    return lines.join('\n');
}

function main() {
    const backendPath = path.resolve(__dirname, '../backend');
    const frontendPath = path.resolve(__dirname, '../frontend');

    console.log('Fetching Backend Production...');
    const backProd = getLicenses(backendPath, true);
    console.log('Fetching Backend Development...');
    const backDev = getLicenses(backendPath, false);

    console.log('Fetching Frontend Production...');
    const frontProd = getLicenses(frontendPath, true);
    console.log('Fetching Frontend Development...');
    const frontDev = getLicenses(frontendPath, false);

    let content = HEADER;

    content += '\n## Backend Dependencies (from backend/package.json)\n\n';
    content += '### Production Dependencies\n';
    content += formatDeps(backProd);
    content += '\n\n### Development Dependencies\n';
    content += formatDeps(backDev);

    content += '\n\n## Frontend Dependencies (from frontend/package.json)\n\n';
    content += '### Production Dependencies\n';
    content += formatDeps(frontProd);
    content += '\n\n### Development Dependencies\n';
    content += formatDeps(frontDev);

    content += '\n' + FOOTER;

    fs.writeFileSync(path.resolve(__dirname, '../THIRD-PARTY-NOTICES.md'), content);
    console.log('Successfully wrote THIRD-PARTY-NOTICES.md');
}

main();
