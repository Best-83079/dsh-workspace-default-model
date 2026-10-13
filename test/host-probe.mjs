/**
 * Local probe: run this plugin's real `apply` against a minimal Cordis context
 * with stub services, so the Host half can be exercised without a live Harness.
 *
 * Covers: plugin activation, the optional `settings` child that owns the page
 * policy, mapping lookup for a fresh top-level Session, the first-request route
 * replacement, the unsupported-effort fallback, the manual-switch escape, and
 * reads of a volatile (live) Config field.
 *
 * Run: node test/host-probe.mjs
 */
import { MODULE_URL, requirePackage } from './env.mjs';

const { Context, resolveConfig } = requirePackage('@deepseek-ai/cordis');

let failures = 0;
function check(label, actual, expected) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (!ok) failures += 1;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` -> ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`}`);
}

const mod = await import(MODULE_URL);

const MEMBER = 'C:\\work\\my-project';
const PARENT_MAPPED = 'C:\\work\\parent-project';
const NESTED = 'C:\\work\\parent-project\\sub';
const UNMAPPED = 'C:\\work\\other-project';
const MAPPINGS = [
	{ path: MEMBER, provider: 'dsh-opencode-go', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' },
	{ path: PARENT_MAPPED, provider: 'strata', model: 'qwen3.8-flash-next-iq3_s' },
];

/** A Context carrying the injected services, plus the recording stubs. */
function harness({ deployment = { provider: 'dsh-opencode-go', model: 'deepseek-v4.1-flash' }, resolveCallConfig } = {}) {
	const record = { configure: [] };
	const ctx = new Context();
	ctx.provide('agentDefaultModel', {
		currentSelection: () => ({ ...deployment }),
		saveSelection: async () => {},
	});
	ctx.provide('llm', { resolveCallConfig: resolveCallConfig ?? (async (config) => ({ ...config })) });
	ctx.provide('sessionProjections', { stateOf: () => undefined });
	ctx.provide('settings', {
		configure: (presentation, owner) => {
			record.configure.push({ presentation, owner });
			return () => {};
		},
	});
	return { ctx, record };
}

/**
 * Mount the plugin the way the Loader does, or with an already-resolved live
 * config when `live` is supplied (the shape a volatile field arrives in).
 */
async function mount(ctx, config, { live = false } = {}) {
	const fiber = ctx.plugin({
		name: mod.name,
		inject: mod.inject,
		Config: live ? undefined : mod.Config,
		apply: (inner, cfg) => mod.apply(inner, cfg),
	}, config);
	await fiber;
	return fiber;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

/** A fresh top-level agent whose directory is the mapped member workspace. */
function freshAgent(cwd) {
	const appended = [];
	let header;
	return {
		appended,
		agent: {
			session: {
				header: { cwd },
				requestHeader: () => header,
				append: (type, value) => appended.push({ type, value }),
			},
			options: { provider: 'dsh-opencode-go', model: 'deepseek-v4.1-flash' },
		},
		/** The real loop records the request header once the first request settles. */
		markRequested: () => {
			header = { config: { provider: 'dsh-opencode-go', model: 'deepseek-v4.1-flash' } };
		},
	};
}

// 1. Activation and the settings page policy.
{
	const { ctx, record } = harness();
	const fiber = await mount(ctx, { mappings: MAPPINGS });
	check('plugin reaches the active state', fiber.state, 2);
	await settle();
	check('settings page policy registered once', record.configure.length, 1);
	check('policy disables the generated page', record.configure[0]?.presentation, { auto: false });
	const owner = record.configure[0]?.owner;
	check('policy names our row runtime', owner?.runtime?.Config === mod.Config, true);
}

// 2. A fresh top-level Session in the mapped workspace records the mapped route.
{
	const { ctx } = harness();
	await mount(ctx, { mappings: MAPPINGS });
	const { agent, appended } = freshAgent(MEMBER);
	ctx.emit('agent/created', { agent, source: 'startup' });
	await settle();
	check('mapped Session records one selection', appended.length, 1);
	check('recorded selection', appended[0]?.value, { provider: 'dsh-opencode-go', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' });
}

// 3. The first request is rerouted, and unrelated request fields survive.
{
	const { ctx } = harness();
	await mount(ctx, { mappings: MAPPINGS });
	const { agent, markRequested } = freshAgent(MEMBER);
	ctx.emit('agent/created', { agent, source: 'startup' });
	await settle();
	const inherited = { provider: 'strata', model: 'qwen3.8-flash-next-iq3_s', reasoningEffort: 'xhigh', maxTokens: 4096 };
	const first = await ctx.waterfall('agent/request', { agent }, () => inherited);
	check('first request takes the mapped route', [first.provider, first.model, first.reasoningEffort], ['dsh-opencode-go', 'deepseek-v4.1-flash', 'high']);
	check('unrelated request fields survive', first.maxTokens, 4096);
	markRequested();
	const second = await ctx.waterfall('agent/request', { agent }, () => inherited);
	check('the mapping owns only the first request', [second.provider, second.model], ['strata', 'qwen3.8-flash-next-iq3_s']);
}

// 4. A workspace outside every mapping keeps the deployment default.
{
	const { ctx } = harness();
	await mount(ctx, { mappings: MAPPINGS });
	const { agent, appended } = freshAgent(UNMAPPED);
	ctx.emit('agent/created', { agent, source: 'startup' });
	await settle();
	check('unmapped directory records nothing', appended.length, 0);
}

// 5. A parent-directory mapping covers its children.
{
	const { ctx } = harness();
	await mount(ctx, { mappings: MAPPINGS });
	const { agent, appended } = freshAgent(NESTED);
	ctx.emit('agent/created', { agent, source: 'startup' });
	await settle();
	check('a nested directory inherits its parent mapping', appended[0]?.value, { provider: 'strata', model: 'qwen3.8-flash-next-iq3_s' });
}

// 6. An unsupported reasoning effort loses the effort, not the model. Only the
//    adapter's own refusal code may be retried without the effort.
{
	let calls = 0;
	const { ctx } = harness({
		deployment: { provider: 'strata', model: 'qwen3.8-flash-next-iq3_s' },
		resolveCallConfig: async (config) => {
			calls += 1;
			if (config.reasoningEffort === 'high') {
				throw Object.assign(new Error('unsupported reasoning effort'), { code: 'UNSUPPORTED_REASONING_EFFORT' });
			}
			return config;
		},
	});
	await mount(ctx, { mappings: MAPPINGS });
	const { agent, appended } = freshAgent(MEMBER);
	agent.options = { provider: 'strata', model: 'qwen3.8-flash-next-iq3_s' };
	ctx.emit('agent/created', { agent, source: 'startup' });
	await settle();
	check('route kept without the rejected effort', appended[0]?.value, { provider: 'dsh-opencode-go', model: 'deepseek-v4.1-flash' });
	check('the rejected effort is retried without it', calls, 2);
}
{
	// The same mapping, but the resolve fails for a reason that is not the effort:
	// the failure must not be retried and mislabelled as an effort rejection.
	let calls = 0;
	const { ctx } = harness({
		deployment: { provider: 'strata', model: 'qwen3.8-flash-next-iq3_s' },
		resolveCallConfig: async () => {
			calls += 1;
			throw new Error('provider is not registered');
		},
	});
	await mount(ctx, { mappings: MAPPINGS });
	const { agent, appended } = freshAgent(MEMBER);
	agent.options = { provider: 'strata', model: 'qwen3.8-flash-next-iq3_s' };
	ctx.emit('agent/created', { agent, source: 'startup' });
	await settle();
	check('a non-effort failure records no selection', appended.length, 0);
	check('a non-effort failure is not retried without the effort', calls, 1);
}

// 7. A resume, a clear, a fork seed, and a subagent child are out of scope.
{
	const { ctx } = harness();
	await mount(ctx, { mappings: MAPPINGS });
	for (const [label, source] of [['resume', 'resume'], ['clear', 'clear']]) {
		const { agent, appended } = freshAgent(MEMBER);
		ctx.emit('agent/created', { agent, source });
		await settle();
		check(`${label} is not remapped`, appended.length, 0);
	}
	for (const [label, patch] of [['a child Session', { parentSession: 'session-parent' }], ['a seeded fork', { isSeeded: true }], ['a subagent', { origin: 'subagent' }]]) {
		const { agent, appended } = freshAgent(MEMBER);
		Object.assign(agent.session.header, patch);
		ctx.emit('agent/created', { agent, source: 'startup' });
		await settle();
		check(`${label} is not remapped`, appended.length, 0);
	}
}

// 8. A creator that asked for another route keeps it.
{
	const { ctx } = harness();
	await mount(ctx, { mappings: MAPPINGS });
	const { agent, appended } = freshAgent(MEMBER);
	agent.options = { provider: 'strata', model: 'qwen3.8-flash-next-iq3_s', reasoningEffort: 'xhigh' };
	ctx.emit('agent/created', { agent, source: 'startup' });
	await settle();
	check('an explicit creator route wins', appended.length, 0);
}

// 9. A mapping equal to the deployment default is left alone.
{
	const { ctx } = harness({ deployment: { provider: 'strata', model: 'qwen3.8-flash-next-iq3_s' } });
	await mount(ctx, { mappings: MAPPINGS });
	const { agent, appended } = freshAgent(PARENT_MAPPED);
	agent.options = { provider: 'strata', model: 'qwen3.8-flash-next-iq3_s' };
	ctx.emit('agent/created', { agent, source: 'startup' });
	await settle();
	check('a redundant mapping writes nothing', appended.length, 0);
}

// 10. A volatile Config field is read through its live reference.
{
	const { ctx } = harness();
	const live = resolveConfig({ Config: mod.Config }, { mappings: MAPPINGS });
	check('the resolved field really is a live reference', typeof live.mappings?.get, 'function');
	await mount(ctx, live, { live: true });
	const { agent, appended } = freshAgent(MEMBER);
	ctx.emit('agent/created', { agent, source: 'startup' });
	await settle();
	check('a volatile Config is still applied', appended[0]?.value, { provider: 'dsh-opencode-go', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' });
}

// 11. An incomplete entry is dropped without costing the usable ones.
{
	const { ctx } = harness();
	await mount(ctx, { mappings: [{ path: '', provider: '', model: '' }, ...MAPPINGS] });
	const { agent, appended } = freshAgent(MEMBER);
	ctx.emit('agent/created', { agent, source: 'startup' });
	await settle();
	check('an incomplete entry is ignored, the rest applies', appended[0]?.value, { provider: 'dsh-opencode-go', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' });
}

// 12. An empty mapping list leaves every Session on the deployment default.
{
	const { ctx } = harness();
	await mount(ctx, { mappings: [] });
	const { agent, appended } = freshAgent(MEMBER);
	ctx.emit('agent/created', { agent, source: 'startup' });
	await settle();
	check('no mappings means no interference', appended.length, 0);
}

// 13. A creator that named no route at all does not block the mapping: an ACP
//     caller without provider/model passes `{}` (those AgentOptions are optional).
{
	const { ctx } = harness();
	await mount(ctx, { mappings: MAPPINGS });
	const { agent, appended } = freshAgent(MEMBER);
	agent.options = {};
	ctx.emit('agent/created', { agent, source: 'startup' });
	await settle();
	check('an unnamed route still takes the mapping', appended[0]?.value, { provider: 'dsh-opencode-go', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' });
}

// 14. A creator that named the same route plus its own effort keeps that effort:
//     the mapping still owns the route, the caller owns the effort it asked for.
{
	const { ctx } = harness();
	await mount(ctx, { mappings: MAPPINGS });
	const { agent, appended } = freshAgent(MEMBER);
	agent.options = { provider: 'dsh-opencode-go', model: 'deepseek-v4.1-flash', reasoningEffort: 'low' };
	ctx.emit('agent/created', { agent, source: 'startup' });
	await settle();
	check('the creator effort wins over the mapping effort', appended[0]?.value, { provider: 'dsh-opencode-go', model: 'deepseek-v4.1-flash', reasoningEffort: 'low' });
}

console.log(failures === 0 ? '\nall host probes passed' : `\n${failures} host probe(s) failed`);
process.exit(failures === 0 ? 0 : 1);
