/**
 * Local probe: prove the Config resolves inside a process shaped like a real
 * harness — one that does NOT carry `DSH_PROFILE_DIR` (the composition injects
 * that into shell calls only), whose `argv[1]` is the running dsh entry, and
 * whose `cwd` is a workspace rather than the profile.
 *
 * This is the regression test for the bug where the Settings page reported
 * "the Host does not expose the settings namespace": the row was active but had
 * no Config, because the resolver only looked at environment variables.
 *
 * Run: node test/resolve-probe.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MODULE_URL, packageDir, resolutionBases } from './env.mjs';

let failures = 0;
let skipped = 0;
function check(label, actual, expected) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (!ok) failures += 1;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` -> ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`}`);
}
function skip(label, why) {
	skipped += 1;
	console.log(`SKIP ${label} (${why})`);
}

/** The running dsh entry, as a real launch spells it in `argv[1]`. */
function dshCli() {
	const dir = packageDir('@deepseek-ai/dsh');
	if (dir === undefined) return undefined;
	try {
		const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
		const bin = typeof manifest.bin === 'string' ? manifest.bin : Object.values(manifest.bin ?? {})[0];
		return typeof bin === 'string' ? join(dir, bin) : undefined;
	} catch {
		return undefined;
	}
}

/** A profile directory that actually hoists schemastery, for the env-var shape. */
function profileDir() {
	if (typeof process.env.DSH_PROFILE_DIR === 'string' && process.env.DSH_PROFILE_DIR !== '') return process.env.DSH_PROFILE_DIR;
	for (const base of resolutionBases()) {
		const dir = base.endsWith('package.json') ? base.slice(0, -'package.json'.length - 1) : base;
		if (existsSync(join(dir, 'node_modules', '@deepseek-ai', 'schemastery'))) return dir;
	}
	return undefined;
}

/** Import a fresh copy of the module under a simulated process environment. */
async function resolveUnder(tag, { argv, env }) {
	const savedArgv = process.argv;
	const savedEnv = { ...process.env };
	for (const key of ['DSH_PROFILE_DIR', 'DSH_PROFILE', 'DSH_HOME']) delete process.env[key];
	process.argv = argv;
	if (env !== undefined) Object.assign(process.env, env);
	try {
		const mod = await import(`${MODULE_URL}?sim=${tag}${Date.now()}`);
		return mod.Config === undefined
			? { config: 'undefined' }
			: { config: 'declared', mappings: mod.Config.dict?.mappings?.type, volatile: mod.Config.dict?.mappings?.meta?.volatile };
	} finally {
		process.argv = savedArgv;
		for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
		Object.assign(process.env, savedEnv);
	}
}

const cli = dshCli();
const profile = profileDir();
const declared = { config: 'declared', mappings: 'array', volatile: true };

// 1. The real shape: no DSH_* variables, argv[1] is the running dsh entry.
if (cli === undefined) skip('harness shape (argv[1] = dsh entry)', 'no dsh installation resolvable');
else check('harness shape (argv[1] = dsh entry)', await resolveUnder('harness', { argv: [process.execPath, cli, 'web'] }), declared);

// 2. A shell shape that still exports the profile directory.
if (profile === undefined) skip('shell shape (DSH_PROFILE_DIR set)', 'no profile directory with schemastery found');
else check('shell shape (DSH_PROFILE_DIR set)', await resolveUnder('env', { argv: [process.execPath, cli ?? 'dsh', 'web'], env: { DSH_PROFILE_DIR: profile } }), declared);

// 3. A shape whose argv names nothing useful: the profile layout has to answer.
check('no usable argv (profile layout answers)', await resolveUnder('scan', { argv: [process.execPath, 'dsh', 'web'] }), declared);

console.log(failures === 0 ? `\nall resolve probes passed${skipped === 0 ? '' : ` (${skipped} skipped)`}` : `\n${failures} resolve probe(s) failed`);
process.exit(failures === 0 ? 0 : 1);
