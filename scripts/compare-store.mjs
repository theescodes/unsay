/**
 * Checks that the Chrome Web Store serves the same extension as the GitHub release of the same
 * version: downloads the store's package, reads its version, downloads that release's zip and
 * compares the two file by file.
 *
 * The store changes its copy in two known ways, which are allowed for: it adds `_metadata/` (its
 * signed hashes of the files) and an `update_url` field in manifest.json. Anything else that
 * differs fails the check.
 *
 * Downloaded files stay in <dir>, so the release zip can be verified afterwards with
 * `gh attestation verify <dir>/unsay-X.Y.Z-chrome.zip --repo theescodes/unsay`.
 *
 * Needs `unzip`. Usage: node scripts/compare-store.mjs <store item id> <dir>
 */

import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const REPO = 'theescodes/unsay';
const STORE_ONLY = ['_metadata/'];
const STORE_MANIFEST_FIELDS = ['update_url'];

const [itemId, dir] = process.argv.slice(2);
if (!/^[a-p]{32}$/.test(itemId ?? '') || !dir) {
	console.error('Usage: node scripts/compare-store.mjs <store item id> <dir>');
	process.exit(2);
}

async function download(url, file) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${url} answered ${response.status}`);
	const bytes = Buffer.from(await response.arrayBuffer());
	await writeFile(file, bytes);
	return bytes;
}

/** A CRX3 file is "Cr24", the format version, the header length, the header, then a plain zip. */
function zipFromCrx(crx) {
	if (crx.toString('latin1', 0, 4) !== 'Cr24' || crx.readUInt32LE(4) !== 3) {
		throw new Error('The store did not send a CRX3 package');
	}
	return crx.subarray(12 + crx.readUInt32LE(8));
}

async function unpack(zip, into) {
	await rm(into, { recursive: true, force: true });
	await mkdir(into, { recursive: true });
	execFileSync('unzip', ['-q', zip, '-d', into]);
}

async function listFiles(root) {
	const entries = await readdir(root, { recursive: true, withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile())
		.map((entry) => relative(root, join(entry.parentPath, entry.name)).split('\\').join('/'))
		.sort();
}

await mkdir(dir, { recursive: true });

// The update service hands out the current published package; prodversion only has to be a
// Chrome version new enough for the extension.
const crxUrl =
	'https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx3' +
	`&prodversion=150.0&x=id%3D${itemId}%26installsource%3Dondemand%26uc`;
const crx = await download(crxUrl, join(dir, 'store.crx'));
await writeFile(join(dir, 'store.zip'), zipFromCrx(crx));
await unpack(join(dir, 'store.zip'), join(dir, 'store'));

const storeManifest = JSON.parse(await readFile(join(dir, 'store', 'manifest.json'), 'utf8'));
const version = storeManifest.version;
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
	throw new Error(`The store's manifest has no plain version: ${JSON.stringify(version)}`);
}

const zipName = `unsay-${version}-chrome.zip`;
await download(
	`https://github.com/${REPO}/releases/download/v${version}/${zipName}`,
	join(dir, zipName)
);
await unpack(join(dir, zipName), join(dir, 'release'));

const storeFiles = (await listFiles(join(dir, 'store'))).filter(
	(file) => !STORE_ONLY.some((prefix) => file.startsWith(prefix))
);
const releaseFiles = await listFiles(join(dir, 'release'));
const problems = [];

for (const file of releaseFiles) {
	if (!storeFiles.includes(file)) problems.push(`missing in the store: ${file}`);
}
for (const file of storeFiles) {
	if (!releaseFiles.includes(file)) {
		problems.push(`only in the store: ${file}`);
		continue;
	}
	const ours = await readFile(join(dir, 'release', file));
	const theirs = await readFile(join(dir, 'store', file));
	if (file === 'manifest.json') {
		const stripped = { ...storeManifest };
		for (const field of STORE_MANIFEST_FIELDS) delete stripped[field];
		if (!isDeepStrictEqual(stripped, JSON.parse(ours.toString('utf8')))) {
			problems.push('manifest.json differs beyond the fields the store adds');
		}
	} else if (!ours.equals(theirs)) {
		problems.push(`differs: ${file}`);
	}
}

if (problems.length > 0) {
	console.error(`The store's ${version} does not match the release ${zipName}:`);
	for (const problem of problems) console.error(`  ${problem}`);
	process.exit(1);
}
console.log(`The store's ${version} matches ${zipName}: ${releaseFiles.length} files.`);
