/**
 * Shared local-environment discovery for the probes beside this file.
 *
 * Every probe is a maintainer diagnostic run on a machine that has dsh
 * installed, so nothing here hardcodes one user's paths: the candidate order
 * mirrors what `index.js` itself uses, which keeps a probe failing for the same
 * reason the plugin would.
 *
 * @module dsh-workspace-default-model/test/env
 */
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/** The plugin entry the probes exercise, addressed from this file. */
export const MODULE_URL = new URL('../index.js', import.meta.url).href;

/**
 * The dsh home directory.
 * @returns `$DSH_HOME`, else `<home>/.dsh`, or undefined when neither is known.
 */
export function dshHome() {
	if (typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME !== '') return process.env.DSH_HOME;
	const home = process.env.USERPROFILE ?? process.env.HOME;
	return typeof home === 'string' && home !== '' ? join(home, '.dsh') : undefined;
}

/**
 * Candidate `package.json` bases to resolve dsh packages from, best first. The
 * harness process itself carries no `DSH_PROFILE_DIR` — the composition injects
 * that into shell calls — so the running dsh entry and the profile layout are
 * what actually locate a package.
 * @returns candidate base paths, deduplicated in priority order.
 */
export function resolutionBases() {
	const bases = [];
	const add = (base) => {
		if (typeof base === 'string' && base !== '' && !bases.includes(base)) bases.push(base);
	};
	const home = dshHome();
	if (typeof process.env.DSH_PROFILE_DIR === 'string') add(join(process.env.DSH_PROFILE_DIR, 'package.json'));
	if (typeof process.env.DSH_PROFILE === 'string' && home !== undefined) {
		add(join(home, 'profiles', process.env.DSH_PROFILE, 'package.json'));
	}
	for (const arg of process.argv.slice(1)) {
		if (typeof arg === 'string' && /\.(?:mjs|cjs|js)$/i.test(arg)) add(arg);
	}
	add(process.argv[1]);
	if (typeof process.env.APPDATA === 'string') {
		add(join(process.env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'));
	}
	if (home !== undefined) {
		const profiles = join(home, 'profiles');
		try {
			if (existsSync(profiles)) for (const name of readdirSync(profiles)) add(join(profiles, name, 'package.json'));
		} catch {
			// A missing or unreadable profiles directory just skips this candidate.
		}
	}
	add(join(process.cwd(), 'package.json'));
	return bases;
}

/**
 * Resolve one package's module from the candidate bases.
 * @param specifier - package name to require.
 * @returns the required module.
 * @throws when no candidate base resolves it.
 */
export function requirePackage(specifier) {
	for (const base of resolutionBases()) {
		try {
			return createRequire(base)(specifier);
		} catch {
			// Try the next candidate.
		}
	}
	throw new Error(`no candidate base resolves ${JSON.stringify(specifier)}; set DSH_PROFILE_DIR to an installed profile`);
}

/**
 * Resolve one package's directory through the `./package.json` export its
 * manifest declares.
 * @param specifier - package name to locate.
 * @returns the package directory, or undefined when unresolved.
 */
export function packageDir(specifier) {
	for (const base of resolutionBases()) {
		try {
			return dirname(createRequire(base).resolve(`${specifier}/package.json`));
		} catch {
			// Try the next candidate.
		}
	}
	return undefined;
}

/**
 * The dsh home's Session log directory.
 * @returns the directory, or undefined when the home or the directory is absent.
 */
export function sessionsDir() {
	const home = dshHome();
	if (home === undefined) return undefined;
	const dir = join(home, 'sessions');
	return existsSync(dir) ? dir : undefined;
}
