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
 * The bundle imports no Harness package: a `link:`-installed workspace bundle
 * resolves its imports from the workspace, not from the profile, so a
 * schemastery `Config` would fail to load here. `mappings` is therefore
 * normalized and validated in `apply` instead.
 *
 * @module dsh-workspace-default-model
 */
import { findMapping, normalizeMappings, sameRoute, sameSelection } from './match.js';

export const name = 'workspace-default-model';
export const inject = ['agentDefaultModel', 'llm', 'sessionProjections'];

/**
 * The route this plugin promised one Session, keyed by that Session object.
 * Populated at creation and dropped once the Session's first request header is
 * logged, so a Session never carries plugin state past the decision.
 */
const promised = new WeakMap();

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
	const entries = Array.isArray(config?.mappings) ? config.mappings : [];
	const mappings = normalizeMappings(entries);
	if (entries.length !== mappings.length) {
		ctx.logger.warn(`workspace-default-model: ignored ${entries.length - mappings.length} incomplete mapping entr${entries.length - mappings.length === 1 ? 'y' : 'ies'}; each needs a path, provider, and model`);
	}
	if (mappings.length === 0) {
		ctx.logger.info('workspace-default-model: no mappings configured; every Session keeps the deployment default model');
		return;
	}
	ctx.logger.info(`workspace-default-model: active with ${mappings.length} workspace mapping${mappings.length === 1 ? '' : 's'}`);

	/** Resolve one mapping through the composition's own model resolution. */
	async function resolveSelection(mapping) {
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
	}

	ctx.on('agent/created', async ({ agent, source }) => {
		try {
			if (!isFreshTopLevelSession(agent, source)) return;
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
