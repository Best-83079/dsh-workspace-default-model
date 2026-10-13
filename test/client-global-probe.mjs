/**
 * Local probe for the client half: mount the real `settings.section` component
 * with a stub module loader, a minimal React, and stub Cordis services, then
 * drive the global-default editor the way a user does.
 *
 * The page is plain-JavaScript React over `ctx.configForms`, so it needs no
 * Harness running: the stub below supplies exactly the surfaces `client.js`
 * touches (`slots`, `locale`, `configForms`, `remote.session`) plus the hooks
 * Section uses. That is what makes it possible to assert the whole write path —
 * the ops `mutate` receives, the disabled states, and the draft/dirty cycle —
 * without a browser.
 *
 * The last group checks the Host side of that path from the installed package:
 * the `agent-default-model` namespace must declare `provider`, `model`, and
 * `reasoningEffort` volatile, or the settings service refuses the write. It
 * reports SKIP when no installed dsh resolves the package.
 *
 * Run: node test/client-global-probe.mjs
 */
import { requirePackage } from './env.mjs';

const CLIENT_URL = new URL('../client.js', import.meta.url).href;
const GLOBAL_NS = 'agent-default-model';
const MAPPING_NS = 'workspace-default-model';

let failures = 0;
function check(label, actual, expected) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (!ok) failures += 1;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` -> ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`}`);
}

const routeKey = (provider, model) => `${provider}\u0000${model}`;
const ROUTE_EFFORT = routeKey('p1', 'm-effort');
const ROUTE_PLAIN = routeKey('p1', 'm-plain');

/** A catalog shaped like `remote.session.modelCatalog()` answers. */
function catalog(defaultSelection) {
	return {
		groups: [{
			id: 'p1',
			name: 'Provider One',
			models: [
				{ id: 'm-effort', name: 'Effort Model', reasoning: { efforts: [{ id: 'high', name: 'High' }, { id: 'low', name: 'Low' }], defaultEffort: 'high' } },
				{ id: 'm-plain', name: 'Plain Model' },
			],
		}],
		default: defaultSelection,
		failures: [],
	};
}

// ---------------------------------------------------------------------------
// Minimal React: the hooks Section uses, with React's deps and slot semantics.
// ---------------------------------------------------------------------------
function createReact() {
	/** Hook slots, reset per render pass the way React matches them by order. */
	let hooks = [];
	let cursor = 0;
	let afterRender = [];
	let latest = null;
	let busy = false;
	let pending = false;
	let component = null;
	let props = null;

	const sameDeps = (left, right) => Array.isArray(left) && Array.isArray(right)
		&& left.length === right.length
		&& left.every((value, index) => Object.is(value, right[index]));

	const render = () => {
		do {
			pending = false;
			cursor = 0;
			afterRender = [];
			busy = true;
			latest = component(props);
			for (const run of afterRender) run();
			busy = false;
		} while (pending);
	};

	const schedule = () => {
		pending = true;
		if (!busy) render();
	};

	const React = {
		createElement(type, elementProps, ...children) {
			return { type, props: elementProps ?? {}, children: children.flat(Infinity) };
		},
		useMemo(factory, deps) {
			const slot = hooks[cursor++];
			if (slot !== undefined && sameDeps(slot.deps, deps)) return slot.value;
			const value = factory();
			hooks[cursor - 1] = { deps, value };
			return value;
		},
		useCallback(callback, deps) {
			return React.useMemo(() => callback, deps);
		},
		useState(initial) {
			const at = cursor++;
			if (hooks[at] === undefined) hooks[at] = { value: typeof initial === 'function' ? initial() : initial };
			const slot = hooks[at];
			return [slot.value, (next) => {
				const value = typeof next === 'function' ? next(slot.value) : next;
				if (Object.is(value, slot.value)) return;
				slot.value = value;
				schedule();
			}];
		},
		useSyncExternalStore(_subscribe, read) {
			return read();
		},
		useEffect(effect, deps) {
			const at = cursor++;
			const slot = hooks[at];
			if (slot !== undefined && sameDeps(slot.deps, deps)) return;
			const previous = slot?.cleanup;
			hooks[at] = { deps, cleanup: undefined };
			afterRender.push(() => {
				if (typeof previous === 'function') previous();
				const cleanup = effect();
				hooks[at].cleanup = typeof cleanup === 'function' ? cleanup : undefined;
			});
		},
	};

	return {
		React,
		mount(element, elementProps) {
			component = element;
			props = elementProps ?? {};
			render();
		},
		/** Let work scheduled outside a render pass settle, then re-render it. */
		async flush() {
			await new Promise((resolve) => setTimeout(resolve, 0));
			await new Promise((resolve) => setTimeout(resolve, 0));
		},
		get tree() {
			return latest;
		},
	};
}

/** Every rendered node, depth first. */
function nodes(root) {
	const out = [];
	const visit = (node) => {
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (node === null || node === undefined || typeof node !== 'object') return;
		out.push(node);
		for (const child of node.children) visit(child);
	};
	visit(root);
	return out;
}

/** All rendered text under one node. */
function textOf(node) {
	if (typeof node === 'string') return node;
	if (node === null || node === undefined || typeof node !== 'object') return '';
	return node.children.map(textOf).join('');
}

/** Whether any node's own text contains a fragment. */
function shows(root, fragment) {
	return nodes(root).some((node) => textOf(node).includes(fragment));
}

/** The one element of a type whose own text is exactly a label. */
function labelled(root, type, label) {
	return nodes(root).find((node) => node.type === type && textOf(node) === label);
}

/**
 * The selects carrying one accessible name, in render order: the global card
 * renders before the workspace rows.
 */
function selects(root, ariaLabel) {
	return nodes(root).filter((node) => node.type === 'select' && node.props['aria-label'] === ariaLabel);
}

/** The single select carrying one accessible name. */
function select(root, ariaLabel) {
	const found = selects(root, ariaLabel);
	if (found.length !== 1) throw new Error(`expected exactly one "${ariaLabel}" select, found ${found.length}`);
	return found[0];
}

/** One stub settings form, including the write record the probe asserts on. */
function form(snapshot) {
	const listeners = new Set();
	const state = { ...snapshot };
	return {
		writes: [],
		accept: true,
		getSnapshot: () => state,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		async set(field, value) {
			this.writes.push({ method: 'set', field, value });
			if (!this.accept) return false;
			state.value = { ...state.value, [field]: value };
			state.revision += 1;
			return true;
		},
		async mutate(ops, expectedRevision) {
			this.writes.push({ method: 'mutate', ops, expectedRevision });
			if (!this.accept) return false;
			const next = { ...state.value };
			for (const op of ops) {
				if (op.op === 'unset') delete next[op.path[0]];
				else next[op.path[0]] = op.value;
			}
			state.value = next;
			state.revision += 1;
			return true;
		},
	};
}

/**
 * Mount the page over stub services.
 * @param options - mapping/global form snapshots, catalog, and workspaces.
 * @returns the mounted tree, the forms, and the re-render flush.
 */
function mountSection({ mappings = [], global = undefined, catalogValue = undefined, workspaces = undefined } = {}) {
	const forms = {
		[MAPPING_NS]: form({ status: 'ready', value: { mappings }, writable: true, mode: 'host', revision: 3 }),
		[GLOBAL_NS]: global ?? form({ status: 'ready', value: { provider: 'p1', model: 'm-effort', reasoningEffort: 'high' }, writable: true, mode: 'host', revision: 7 }),
	};
	const sessionNamespace = {
		modelCatalog: async () => ({ ok: true, value: catalogValue ?? catalog({ provider: 'p1', model: 'm-effort', reasoningEffort: 'high' }) }),
	};
	const configForms = {
		get: (namespace) => forms[namespace],
		describe: () => ({ getSnapshot: () => ({ view: { namespaces: [{ ns: MAPPING_NS }, { ns: GLOBAL_NS }] } }) }),
	};
	const react = createReact();
	const ctx = {
		get: (key) => (key === 'configForms' ? configForms : undefined),
		effect: (fn) => {
			fn();
			return () => {};
		},
		on: () => () => {},
		inject: (_deps, callback) => {
			callback({
				get: (key) => (key === 'remote.session' ? sessionNamespace : undefined),
				remote: { session: sessionNamespace },
			});
			return () => {};
		},
		locale: {
			register: () => () => {},
			bind: () => (key) => key,
			getLocale: () => ({ active: 'en' }),
		},
		slots: {
			inject: (_key, callback) => callback(),
			register: (spec, element) => {
				ctx.registered = { spec, element };
				return () => {};
			},
		},
	};
	const module = registration.factory((specifier) => {
		if (specifier !== 'react') throw new Error(`unexpected client require(${JSON.stringify(specifier)})`);
		return react.React;
	});
	module.apply(ctx);
	react.mount(ctx.registered.element, workspaces === undefined ? {} : { useWorkspaces: () => workspaces });
	return { react, forms, ctx };
}

// The client module registers itself through the page's loader, which the stub
// captures once: a module table materializes a factory per id, and this probe
// re-runs `apply` with fresh stub services for every scenario.
let registration;
globalThis.window = { __ModuleLoader__: { load: (value) => { registration = value; } } };
await import(CLIENT_URL);
if (registration === undefined) throw new Error('client.js did not register through window.__ModuleLoader__.load');

// 1. The global default renders as an editable card carrying the stored route,
//    and saving it writes the whole selection in one atomic mutate.
{
	const { react, forms } = mountSection();
	await react.flush();
	check('the global card exists', shows(react.tree, 'Global default'), true);
	check('the save control names its scope', labelled(react.tree, 'button', 'Save global default') !== undefined, true);
	const modelSelect = select(react.tree, 'Select a model');
	check('the stored global route is selected', modelSelect.props.value, ROUTE_EFFORT);
	check('the stored effort is selected', select(react.tree, 'Reasoning effort').props.value, 'high');
	check('the controls are usable', modelSelect.props.disabled, false);
	check('save is idle until something changes', labelled(react.tree, 'button', 'Save global default').props.disabled, true);

	// Switching to a model with no efforts drops the effort control and marks the
	// card dirty; the write then clears the field rather than storing ''.
	select(react.tree, 'Select a model').props.onChange({ target: { value: ROUTE_PLAIN } });
	check('a switch hides the effort control', selects(react.tree, 'Reasoning effort').length, 0);
	check('the draft is shown as selected', select(react.tree, 'Select a model').props.value, ROUTE_PLAIN);
	check('the draft is reported as unsaved', shows(react.tree, 'Unsaved changes'), true);
	const dirtySave = labelled(react.tree, 'button', 'Save global default');
	check('save is enabled while dirty', dirtySave.props.disabled, false);
	await dirtySave.props.onClick();
	check('one atomic mutate carries the whole selection', forms[GLOBAL_NS].writes.map((write) => write.method), ['mutate']);
	check('the ops set the route and clear the effort', forms[GLOBAL_NS].writes[0].ops, [
		{ op: 'set', path: ['provider'], value: 'p1' },
		{ op: 'set', path: ['model'], value: 'm-plain' },
		{ op: 'unset', path: ['reasoningEffort'] },
	]);
	check('the write carries no stale revision fence', forms[GLOBAL_NS].writes[0].expectedRevision, undefined);
	check('the saved value is reported', labelled(react.tree, 'span', 'Saved') !== undefined, true);
	check('the card is clean again', labelled(react.tree, 'button', 'Save global default').props.disabled, true);
	check('the accepted value became the baseline', select(react.tree, 'Select a model').props.value, ROUTE_PLAIN);
}

// 2. Choosing a model that advertises efforts stores the model's own default.
{
	const { react, forms } = mountSection();
	await react.flush();
	select(react.tree, 'Select a model').props.onChange({ target: { value: ROUTE_PLAIN } });
	select(react.tree, 'Select a model').props.onChange({ target: { value: ROUTE_EFFORT } });
	check('the model default effort is adopted', select(react.tree, 'Reasoning effort').props.value, 'high');
	select(react.tree, 'Reasoning effort').props.onChange({ target: { value: 'low' } });
	check('the chosen effort replaces it', select(react.tree, 'Reasoning effort').props.value, 'low');
	await labelled(react.tree, 'button', 'Save global default').props.onClick();
	check('the effort rides the same mutate', forms[GLOBAL_NS].writes[0].ops, [
		{ op: 'set', path: ['provider'], value: 'p1' },
		{ op: 'set', path: ['model'], value: 'm-effort' },
		{ op: 'set', path: ['reasoningEffort'], value: 'low' },
	]);
}

// 3. A refusal is reported and the draft survives it.
{
	const { react, forms } = mountSection();
	await react.flush();
	forms[GLOBAL_NS].accept = false;
	select(react.tree, 'Select a model').props.onChange({ target: { value: ROUTE_PLAIN } });
	await labelled(react.tree, 'button', 'Save global default').props.onClick();
	check('a refused write is named', shows(react.tree, 'The Host refused this configuration.'), true);
	check('the draft survives the refusal', select(react.tree, 'Select a model').props.value, ROUTE_PLAIN);
	check('the card stays dirty', labelled(react.tree, 'button', 'Save global default').props.disabled, false);
}

// 4. A deployment without the owning namespace shows the default read-only.
{
	const { react } = mountSection({
		global: form({ status: 'unavailable', value: undefined, writable: true, mode: 'host', revision: undefined }),
	});
	await react.flush();
	check('the missing namespace is explained', shows(react.tree, `settings namespace "${GLOBAL_NS}"`), true);
	check('the catalog default is still displayed', select(react.tree, 'Select a model').props.value, ROUTE_EFFORT);
	check('the global selector cannot be used', select(react.tree, 'Select a model').props.disabled, true);
	check('the global save cannot be used', labelled(react.tree, 'button', 'Save global default').props.disabled, true);
}

// 5. The mapping rows still render and save on their own form.
{
	const { react, forms } = mountSection({
		mappings: [{ path: 'C:\\work', provider: 'p1', model: 'm-plain' }],
		workspaces: [{ path: 'C:\\work', title: 'work' }],
	});
	await react.flush();
	// The global card renders first; the workspace row is the second selector.
	const [globalSelect, rowSelect] = selects(react.tree, 'Select a model');
	check('the global card still leads the page', globalSelect.props.value, ROUTE_EFFORT);
	check('the mapped row starts on its stored route', rowSelect.props.value, ROUTE_PLAIN);
	const follow = nodes(rowSelect).find((node) => node.type === 'option' && node.props.value === '');
	check('a row can follow the global default', textOf(follow), 'Follow the global default');
	rowSelect.props.onChange({ target: { value: ROUTE_EFFORT } });
	await labelled(react.tree, 'button', 'Save').props.onClick();
	check('the mapping save still writes mappings', forms[MAPPING_NS].writes[0].method, 'set');
	check('the mapping payload keeps the effort', forms[MAPPING_NS].writes[0].value, [
		{ path: 'C:\\work', provider: 'p1', model: 'm-effort', reasoningEffort: 'high' },
	]);
	check('the global form was not touched', forms[GLOBAL_NS].writes.length, 0);
}

// 6. The Host namespace this page writes must accept those ops.
try {
	const mod = requirePackage('@deepseek-ai/dsh-agent-default-model');
	const schema = (mod.default ?? mod).Config;
	const volatileOf = (field) => schema.dict[field]?.meta?.volatile === true;
	check('the Host namespace declares provider volatile', volatileOf('provider'), true);
	check('the Host namespace declares model volatile', volatileOf('model'), true);
	check('the Host namespace declares reasoningEffort volatile', volatileOf('reasoningEffort'), true);
} catch (error) {
	console.log(`SKIP the installed @deepseek-ai/dsh-agent-default-model was not resolvable (${String(error)})`);
}

console.log(failures === 0 ? '\nall client probes passed' : `\n${failures} client probe(s) failed`);
process.exit(failures === 0 ? 0 : 1);
