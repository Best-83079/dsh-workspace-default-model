/**
 * Per-workspace default model for newly created Sessions.
 *
 * The deployment owns one default model: `sessionController` reads
 * `ctx.agentDefaultModel.currentSelection()` when it creates an Agent, so every
 * new Session starts on the same provider/model. This plugin adds one workspace
 * dimension without changing that default.
 *
 * For a fresh top-level Session whose recorded directory is owned by a
 * configured mapping it:
 *
 * 1. resolves the mapped route through `ctx.llm.resolveCallConfig` — the same
 *    validation the Web model picker performs — and records it as the Session's
 *    own selection (`model/selection`), so the picker shows it immediately and
 *    it survives as durable Session intent;
 * 2. replaces the route of that Session's **first** model request from a
 *    **prepended** `agent/request` listener, which outranks the entry point's
 *    own selection hook.
 *
 * After the first request the logged request header carries the mapped route, so
 * later steps, resumes, and forks keep it without help. A manual model switch in
 * the Session wins over the mapping.
 *
 * The mapping list is the plugin's own Config, so the Web settings page
 * (`./client`, section id `workspace-default-model`) reads and writes the very
 * array this module applies; a page write lands in the profile's
 * `cordis.patch.yml` override for this row and the Loader hot-applies it.
 *
 * The bundle imports no Harness package: a `link:`-installed workspace bundle
 * resolves its imports from the workspace, not from the profile, so a plain
 * `import z from '@deepseek-ai/schemastery'` would fail to load here.
 * `@deepseek-ai/schemastery` is therefore resolved at load time through
 * `createRequire` against the running dsh installation, the profile, or a
 * sibling profile, and the Config is declared only when that succeeds — the
 * mapping policy itself never needs it.
 *
 * @module dsh-workspace-default-model
 */
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { findMapping, normalizeMappings, sameRoute, sameSelection } from './match.js';

export const name = 'workspace-default-model';
export const inject = ['agentDefaultModel', 'llm', 'sessionProjections'];

/**
 * Every place a resolvable `@deepseek-ai/schemastery` may sit, best first. The
 * harness process itself does NOT carry `DSH_PROFILE_DIR` — the composition
 * injects that into shell calls — so the running dsh entry and the profile
 * layout are what actually locate the package.
 * @returns candidate `package.json` paths to resolve from.
 */
function schemasteryBases() {
	const bases = [];
	const add = (base) => {
		if (typeof base === 'string' && base !== '' && !bases.includes(base)) bases.push(base);
	};
	const home = process.env.DSH_HOME
		?? (typeof process.env.USERPROFILE === 'string' ? join(process.env.USERPROFILE, '.dsh') : undefined);
	if (typeof process.env.DSH_PROFILE_DIR === 'string') add(join(process.env.DSH_PROFILE_DIR, 'package.json'));
	if (typeof process.env.DSH_PROFILE === 'string' && home !== undefined) {
		add(join(home, 'profiles', process.env.DSH_PROFILE, 'package.json'));
	}
	// The running dsh entry resolves its own dependencies, whatever launched it:
	// a global npm install, pnpm, npx, or the desktop application.
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
 * Resolve `@deepseek-ai/schemastery` so this bundle can declare a Config. A
 * `link:`-installed bundle resolves imports from the workspace, never from the
 * profile, so this is the only way to get a schema the settings service accepts.
 * @returns the schemastery module and the base that answered it, or undefined.
 */
function loadSchemastery() {
	for (const base of schemasteryBases()) {
		try {
			const required = createRequire(base)('@deepseek-ai/schemastery');
			const candidate = required?.default ?? required;
			if (candidate !== undefined && candidate !== null && typeof candidate.object === 'function') {
				return { schema: candidate, base };
			}
		} catch {
			// Try the next candidate; the mapping policy runs without a Config either way.
		}
	}
	return undefined;
}

const schemastery = loadSchemastery();

/**
 * The mapping list as live Config. `mappings` is volatile so the settings
 * service may write it and the Loader applies the change without a remount.
 * Absent when schemastery cannot be resolved: the policy still reads the
 * deployment's `cordis.patch.yml` value, but no settings page can edit it.
 */
export const Config = schemastery === undefined ? undefined : schemastery.schema.object({
	mappings: schemastery.schema.array(schemastery.schema.object({
		path: schemastery.schema.string().description('Workspace directory; the longest matching prefix wins.').required(),
		provider: schemastery.schema.string().description('Registered provider route.').required(),
		model: schemastery.schema.string().description('Provider-owned model id.').required(),
		reasoningEffort: schemastery.schema.string().description('Optional reasoning effort; the model default when omitted.'),
	})).description('Per-workspace default model for new Sessions.').default([]).volatile(),
});

/**
 * The route this plugin promised one Session, keyed by that Session object.
 * Populated at creation and dropped once the Session's first request header is
 * logged, so a Session never carries plugin state past the decision.
 */
const promised = new WeakMap();

/**
 * Read the configured mapping list from a resolved Config. A volatile field
 * arrives as a live reference, and `apply` is not re-run when it changes, so
 * every decision reads the current value rather than a captured snapshot.
 * @param config - the plugin's resolved Config.
 * @returns the raw mapping entries, in configured order.
 */
function configMappings(config) {
	const field = config?.mappings;
	const value = field !== null
		&& typeof field === 'object'
		&& !Array.isArray(field)
		&& typeof field.get === 'function'
		? field.get()
		: field;
	return Array.isArray(value) ? value : [];
}

/**
 * Whether this agent event is a fresh top-level conversation: not a resume, a
 * cleared or compacted Session, a fork seed, or a subagent child.
 * @param agent - the entered agent.
 * @param source - why the Session lifecycle began.
 * @returns whether the workspace mapping may decide this Session's model.
 */
function isFreshTopLevelSession(agent, source) {
	if (source !== 'startup') return false;
	const header = agent.session.header;
	if (header.cwd === undefined) return false;
	if (header.parentSession !== undefined) return false;
	if (header.isSeeded === true || header.origin === 'subagent') return false;
	return true;
}

/**
 * Install the per-workspace default-model policy.
 * @param ctx - the plugin's context.
 * @param config - the deployment's mapping list.
 */
export function apply(ctx, config) {
	ctx.logger.info('workspace-default-model: active; workspace mappings are Config and are editable in Settings');

	// A custom client page owns this namespace's presentation, so the settings
	// service must not offer a schema-generated page beside it. The child runs
	// only in compositions that mount Settings; the policy works without it.
	const owner = ctx.fiber;
	ctx.inject(['settings'], (settingsCtx) => {
		settingsCtx.effect(() => {
			try {
				return settingsCtx.settings.configure({ auto: false }, owner);
			} catch (error) {
				settingsCtx.logger.warn(`workspace-default-model: settings page policy not registered: ${String(error)}`);
				return undefined;
			}
		});
	});
	if (Config === undefined) {
		ctx.logger.warn('workspace-default-model: @deepseek-ai/schemastery was not resolvable, so the Settings page cannot read or write these mappings; editing the profile cordis.patch.yml keeps working');
	} else {
		ctx.logger.info(`workspace-default-model: Config schema resolved through ${schemastery.base}`);
	}

	/** Resolve one mapping through the composition's own model resolution. */
	async function resolveSelection(mapping) {
		try {
			const resolved = await ctx.llm.resolveCallConfig({
				provider: mapping.provider,
				model: mapping.model,
				...(mapping.reasoningEffort === undefined ? {} : { reasoningEffort: mapping.reasoningEffort }),
			});
			return {
				provider: resolved.provider,
				model: resolved.model,
				...(resolved.reasoningEffort === undefined ? {} : { reasoningEffort: String(resolved.reasoningEffort) }),
			};
		} catch (error) {
			if (mapping.reasoningEffort === undefined) throw error;
			// An unsupported effort must not cost the workspace its model: the
			// route is what the mapping promised, the effort was an extra.
			ctx.logger.warn(`workspace-default-model: ${mapping.rawPath} rejects reasoning effort "${mapping.reasoningEffort}" for ${mapping.provider}/${mapping.model}; using the model default instead (${String(error)})`);
			const resolved = await ctx.llm.resolveCallConfig({ provider: mapping.provider, model: mapping.model });
			return {
				provider: resolved.provider,
				model: resolved.model,
				...(resolved.reasoningEffort === undefined ? {} : { reasoningEffort: String(resolved.reasoningEffort) }),
			};
		}
	}

	ctx.on('agent/created', async ({ agent, source }) => {
		try {
			if (!isFreshTopLevelSession(agent, source)) return;
			const entries = configMappings(config);
			const mappings = normalizeMappings(entries);
			if (entries.length !== mappings.length) {
				ctx.logger.warn(`workspace-default-model: ignored ${entries.length - mappings.length} incomplete mapping entr${entries.length - mappings.length === 1 ? 'y' : 'ies'}; each needs a path, provider, and model`);
			}
			if (mappings.length === 0) return;
			const { session } = agent;
			if (session.requestHeader() !== undefined) return;
			const state = ctx.sessionProjections.stateOf(session, 'modelSelection');
			if (state !== undefined && (state.pending !== null || state.lastUsed !== null)) return;
			const mapping = findMapping(mappings, session.header.cwd);
			if (mapping === undefined) return;
			const deployment = ctx.agentDefaultModel.currentSelection();
			// A creator that asked for another route keeps it (webhook and SDK callers).
			if (!sameRoute(agent.options, deployment)) return;
			if (sameRoute(mapping, deployment) && mapping.reasoningEffort === undefined) return;
			const selection = await resolveSelection(mapping);
			if (sameRoute(selection, deployment) && selection.reasoningEffort === undefined) return;
			session.append('model/selection', selection);
			promised.set(session, selection);
			ctx.logger.info(`workspace-default-model: ${mapping.rawPath} starts new Sessions on ${selection.provider}/${selection.model}${selection.reasoningEffort === undefined ? '' : ` (${selection.reasoningEffort})`}`);
		} catch (error) {
			ctx.logger.warn(`workspace-default-model: no workspace model applied for "${agent.session.header.cwd ?? 'unknown'}": ${String(error)}`);
		}
	});

	// Prepended: the entry point's own selection hook is registered during factory
	// setup and rewrites the resolved config after its inner listeners, so the
	// outermost listener is the only one that can still replace the route.
	ctx.on('agent/request', async ({ agent }, next) => {
		const resolved = await next();
		const selection = promised.get(agent.session);
		if (selection === undefined) return resolved;
		try {
			if (agent.session.requestHeader() !== undefined) {
				promised.delete(agent.session);
				return resolved;
			}
			const state = ctx.sessionProjections.stateOf(agent.session, 'modelSelection');
			const recorded = state === undefined ? null : (state.pending ?? state.lastUsed);
			if (recorded !== null && !sameSelection(recorded, selection)) {
				// A manual model switch in this Session owns the route from here on.
				promised.delete(agent.session);
				return resolved;
			}
			const { reasoningEffort: _inheritedEffort, ...withoutInheritedEffort } = resolved;
			return {
				...withoutInheritedEffort,
				provider: selection.provider,
				model: selection.model,
				...(selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort }),
			};
		} catch (error) {
			ctx.logger.warn(`workspace-default-model: kept the resolved route: ${String(error)}`);
			return resolved;
		}
	}, { prepend: true });
}
