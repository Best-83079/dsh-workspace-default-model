/**
 * Pure path and selection helpers for the workspace-default-model plugin.
 *
 * Kept free of Harness imports so the matching rules can be exercised directly
 * with `node`.
 * @module dsh-workspace-default-model/match
 */

/** Windows paths are case-insensitive; every other platform compares as written. */
const CASE_INSENSITIVE = process.platform === 'win32';

/**
 * Canonicalize one directory path for comparison: trim, unify separators, drop
 * trailing separators, and fold case on Windows.
 * @param value - candidate path.
 * @returns the comparable path, or undefined for a non-string or blank value.
 */
export function normalizePath(value) {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	if (trimmed === '') return undefined;
	const unified = trimmed.replace(/[\\/]+/g, '/').replace(/\/+$/, '');
	return CASE_INSENSITIVE ? unified.toLowerCase() : unified;
}

/**
 * Normalize one configured mapping, dropping entries that name no usable route.
 * @param entry - one raw config entry.
 * @returns the normalized mapping, or undefined when the entry is incomplete.
 */
export function normalizeMapping(entry) {
	if (entry === null || typeof entry !== 'object') return undefined;
	const path = normalizePath(entry.path);
	const provider = typeof entry.provider === 'string' ? entry.provider.trim() : '';
	const model = typeof entry.model === 'string' ? entry.model.trim() : '';
	if (path === undefined || provider === '' || model === '') return undefined;
	const effort = typeof entry.reasoningEffort === 'string' ? entry.reasoningEffort.trim() : '';
	return {
		path,
		rawPath: typeof entry.path === 'string' ? entry.path : path,
		provider,
		model,
		...(effort === '' ? {} : { reasoningEffort: effort }),
	};
}

/**
 * Normalize a configured mapping list.
 * @param entries - raw config entries.
 * @returns the usable mappings, in configured order.
 */
export function normalizeMappings(entries) {
	if (!Array.isArray(entries)) return [];
	const mappings = [];
	for (const entry of entries) {
		const mapping = normalizeMapping(entry);
		if (mapping !== undefined) mappings.push(mapping);
	}
	return mappings;
}

/**
 * Find the mapping that owns a session directory: the mapping path that equals
 * the directory or is one of its ancestors, with the longest path winning.
 * @param mappings - normalized mappings.
 * @param cwd - the session's recorded directory.
 * @returns the winning mapping, or undefined when none owns the directory.
 */
export function findMapping(mappings, cwd) {
	const target = normalizePath(cwd);
	if (target === undefined) return undefined;
	let best;
	for (const mapping of mappings) {
		if (target !== mapping.path && !target.startsWith(`${mapping.path}/`)) continue;
		if (best === undefined || mapping.path.length > best.path.length) best = mapping;
	}
	return best;
}

/**
 * Compare two selections by the fields a session records.
 * @param left - first selection.
 * @param right - second selection.
 * @returns whether both name the same provider, model, and effort.
 */
export function sameSelection(left, right) {
	if (left === null || right === null || left === undefined || right === undefined) return left === right;
	return left.provider === right.provider
		&& left.model === right.model
		&& left.reasoningEffort === right.reasoningEffort;
}

/**
 * Compare two selections by route only, ignoring reasoning effort.
 * @param left - first selection.
 * @param right - second selection.
 * @returns whether both name the same provider and model.
 */
export function sameRoute(left, right) {
	if (left === null || right === null || left === undefined || right === undefined) return false;
	return left.provider === right.provider && left.model === right.model;
}
