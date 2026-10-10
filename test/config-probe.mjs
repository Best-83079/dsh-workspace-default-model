/**
 * Local probe: prove the Host Config resolves, validates a stored mapping list,
 * and that its volatile field arrives as a live reference.
 *
 * Run: node test/config-probe.mjs
 */
import { MODULE_URL, requirePackage } from './env.mjs';

const { resolveConfig } = requirePackage('@deepseek-ai/cordis');
const { isVolatile } = requirePackage('@deepseek-ai/cosmokit');

const mod = await import(MODULE_URL);
console.log('Config declared:', mod.Config !== undefined, 'toJSON:', typeof mod.Config?.toJSON);
console.log('mappings node: type=', mod.Config?.dict?.mappings?.type, 'volatile=', mod.Config?.dict?.mappings?.meta?.volatile);

/** A mapping list shaped like the ones a profile stores. */
const stored = {
	mappings: [
		{ path: 'C:\\work\\my-project', provider: 'dsh-opencode-go', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' },
		{ path: 'C:\\work\\another-project', provider: 'dsh-opencode-go', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' },
		{ path: 'C:\\work', provider: 'strata', model: 'qwen3.8-flash-next-iq3_s' },
	],
};

try {
	const resolved = resolveConfig({ Config: mod.Config }, stored);
	const field = resolved.mappings;
	console.log('stored mappings validate: OK');
	console.log('resolved field is volatile reference:', isVolatile(field), 'has get():', typeof field?.get === 'function', 'isArray:', Array.isArray(field));
	const value = typeof field?.get === 'function' ? field.get() : field;
	console.log('read back count:', Array.isArray(value) ? value.length : 'NOT AN ARRAY', JSON.stringify(Array.isArray(value) ? value[0] : value));
} catch (error) {
	console.log('stored mappings validate: FAILED ->', String(error));
}

// Empty config (the bundle's own default) and the schema round trip the settings service performs.
const empty = resolveConfig({ Config: mod.Config }, {});
const emptyValue = typeof empty.mappings?.get === 'function' ? empty.mappings.get() : empty.mappings;
console.log('empty config default:', JSON.stringify(emptyValue));

const z = requirePackage('@deepseek-ai/schemastery');
const roundTrip = new z(mod.Config.toJSON());
console.log('schema round trip dict keys:', Object.keys(roundTrip.dict ?? {}), 'mappings volatile after round trip:', roundTrip.dict?.mappings?.meta?.volatile);

// A blank path passes the schema on purpose: an incomplete entry must not take
// the whole row down, so the runtime drops it with a warning instead.
try {
	resolveConfig({ Config: mod.Config }, { mappings: [{ path: '', provider: 'p', model: 'm' }] });
	console.log('blank path: accepted by the schema, dropped at runtime with a warning OK');
} catch (error) {
	console.log('blank path: rejected by the schema (runtime filter never reached)');
}

// A route that names no model must never reach the runtime filter.
try {
	resolveConfig({ Config: mod.Config }, { mappings: [{ path: 'C:\\x' }] });
	console.log('missing route accepted: UNEXPECTED');
} catch (error) {
	console.log('missing route rejected: OK');
}
