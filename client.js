/**
 * Workspace models settings page.
 *
 * One Settings section (`settings.section` id `workspace-default-model`) listing
 * the deployment's Workspaces, each with the provider/model/reasoning-effort a
 * new Session in that directory should start on. The page edits the Host
 * plugin's own Config through the shared settings transport
 * (`ctx.configForms.get('workspace-default-model')`), so a save persists into
 * the profile's `cordis.patch.yml` and the running Loader applies it without a
 * restart.
 *
 * The bundle imports nothing but `react`: every other value comes from a Cordis
 * service (`slots`, `locale`, `configForms`, `remote`) resolved at runtime, so a
 * renamed or absent Harness package degrades this page instead of breaking the
 * client module table.
 */

window.__ModuleLoader__.load({
	id: 'dsh-workspace-default-model',
	factory(require) {
		const React = require('react');
		const h = React.createElement;

		/** Host settings namespace: the profile row id of this plugin. */
		const NS = 'workspace-default-model';

		/** Readable keys double as the English fallback text. */
		const EN = {
			'Workspace models': 'Workspace models',
			'New Sessions in a listed directory start on that model instead of the global default. The longest matching directory wins, so a parent directory covers everything beneath it.': 'New Sessions in a listed directory start on that model instead of the global default. The longest matching directory wins, so a parent directory covers everything beneath it.',
			'Global default': 'Global default',
			'Follow the global default': 'Follow the global default',
			'Select a model': 'Select a model',
			'Reasoning effort': 'Reasoning effort',
			'Model default': 'Model default',
			'Save': 'Save',
			'Saved': 'Saved',
			'Unsaved changes': 'Unsaved changes',
			'Loading…': 'Loading…',
			'No workspaces yet. Open a workspace from the sidebar first.': 'No workspaces yet. Open a workspace from the sidebar first.',
			'This page needs the Harness settings service (ctx.configForms), which this client does not provide.': 'This page needs the Harness settings service (ctx.configForms), which this client does not provide.',
			'The Host does not expose the settings namespace "workspace-default-model". Its plugin row is loaded but declared no Config schema — usually @deepseek-ai/schemastery (or its version) could not be resolved inside the running dsh; editing cordis.patch.yml still works.': 'The Host does not expose the settings namespace "workspace-default-model". Its plugin row is loaded but declared no Config schema — usually @deepseek-ai/schemastery (or its version) could not be resolved inside the running dsh; editing cordis.patch.yml still works.',
			'The Host document is read-only for this page (remotes cannot write a non-loopback page).': 'The Host document is read-only for this page (remotes cannot write a non-loopback page).',
			'The model list could not be read; stored mappings stay editable.': 'The model list could not be read; stored mappings stay editable.',
			'These providers did not answer their model list:': 'These providers did not answer their model list:',
			'Reload model list': 'Reload model list',
			'not in the current model list': 'not in the current model list',
			'The Host refused this configuration.': 'The Host refused this configuration.',
			'Failed': 'Failed',
		};

		const ZH = {
			'Workspace models': '按工作区默认模型',
			'New Sessions in a listed directory start on that model instead of the global default. The longest matching directory wins, so a parent directory covers everything beneath it.': '在这些目录里新建的会话使用该工作区指定的模型，而不是全局默认模型。目录按最长匹配生效，所以父目录可以覆盖它下面的一组工作区。',
			'Global default': '全局默认',
			'Follow the global default': '跟随全局默认模型',
			'Select a model': '选择模型',
			'Reasoning effort': '思考强度',
			'Model default': '模型默认',
			'Save': '保存',
			'Saved': '已保存',
			'Unsaved changes': '有未保存的修改',
			'Loading…': '加载中…',
			'No workspaces yet. Open a workspace from the sidebar first.': '还没有工作区。请先在侧边栏打开一个工作区。',
			'This page needs the Harness settings service (ctx.configForms), which this client does not provide.': '这个页面需要 Harness 的 settings 服务（ctx.configForms），当前客户端没有提供。',
			'The Host does not expose the settings namespace "workspace-default-model". Its plugin row is loaded but declared no Config schema — usually @deepseek-ai/schemastery (or its version) could not be resolved inside the running dsh; editing cordis.patch.yml still works.': 'Host 没有暴露配置命名空间 workspace-default-model：这个 row 已经加载，但没有声明 Config schema——通常是运行中的 dsh 解析不到 @deepseek-ai/schemastery（或版本不匹配）。这时直接改 cordis.patch.yml 仍然有效。',
			'The Host document is read-only for this page (remotes cannot write a non-loopback page).': '这个页面对 Host 文档是只读的（非 loopback 页面不能写）。',
			'The model list could not be read; stored mappings stay editable.': '读不到模型列表；已保存的映射仍然可以编辑。',
			'These providers did not answer their model list:': '这些 provider 没有返回模型列表：',
			'Reload model list': '重新加载模型列表',
			'not in the current model list': '不在当前模型列表中',
			'The Host refused this configuration.': 'Host 拒绝了这次配置。',
			'Failed': '失败',
		};

		const CSS = [
			'.wdm-root{display:flex;flex-direction:column;gap:14px;padding:2px 0;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}',
			'.wdm-head{display:flex;flex-direction:column;gap:4px}',
			'.wdm-head h3{margin:0;font-size:15px;font-weight:600}',
			'.wdm-desc{max-width:68ch;color:var(--dsw-alias-label-secondary);font-size:12px}',
			'.wdm-meta{color:var(--dsw-alias-label-secondary);font-size:12px}',
			'.wdm-rows{display:flex;flex-direction:column;gap:8px}',
			'.wdm-row{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}',
			'.wdm-row-head{display:flex;flex-direction:column;gap:2px;min-width:0}',
			'.wdm-name{font-weight:600;overflow-wrap:anywhere}',
			'.wdm-path{color:var(--dsw-alias-label-secondary);font-size:12px;overflow-wrap:anywhere}',
			'.wdm-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
			'.wdm-select{max-width:100%;min-width:220px;height:30px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px}',
			'.wdm-foot{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
			'.wdm-btn{height:30px;padding:0 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer}',
			'.wdm-btn:disabled{opacity:.5;cursor:default}',
			'.wdm-btn-primary{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
			'.wdm-note{font-size:12px;color:var(--dsw-alias-label-secondary)}',
			'.wdm-ok{font-size:12px;color:var(--dsw-alias-state-success-primary)}',
			'.wdm-warn{font-size:12px;color:var(--dsw-alias-state-warn-primary)}',
			'.wdm-error{font-size:12px;color:var(--dsw-alias-state-error-primary)}',
		].join('\n');

		/** Canonicalize a directory path the way the Host matches it. */
		function normalizePath(value) {
			if (typeof value !== 'string') return undefined;
			const trimmed = value.trim();
			if (trimmed === '') return undefined;
			return trimmed.replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase();
		}

		/** One select value identifies one exact provider/model route. */
		function routeKey(provider, model) {
			return `${provider}\u0000${model}`;
		}

		/** Normalize whatever the namespace currently holds into mapping rows. */
		function readMappings(section) {
			const raw = section !== null && typeof section === 'object' && Array.isArray(section.mappings) ? section.mappings : [];
			const out = [];
			for (const entry of raw) {
				if (entry === null || typeof entry !== 'object') continue;
				const path = typeof entry.path === 'string' ? entry.path : '';
				const provider = typeof entry.provider === 'string' ? entry.provider : '';
				const model = typeof entry.model === 'string' ? entry.model : '';
				if (path === '' || provider === '' || model === '') continue;
				const effort = typeof entry.reasoningEffort === 'string' ? entry.reasoningEffort : '';
				out.push({ path, provider, model, ...(effort === '' ? {} : { reasoningEffort: effort }) });
			}
			return out;
		}

		/** Project the Host catalog into provider groups plus a route lookup. */
		function projectCatalog(catalog) {
			const groups = [];
			const byKey = new Map();
			const source = catalog !== null && typeof catalog === 'object' && Array.isArray(catalog.groups) ? catalog.groups : [];
			for (const group of source) {
				if (group === null || typeof group !== 'object' || typeof group.id !== 'string' || group.id === '') continue;
				const models = [];
				for (const item of Array.isArray(group.models) ? group.models : []) {
					if (item === null || typeof item !== 'object' || typeof item.id !== 'string' || item.id === '') continue;
					const key = routeKey(group.id, item.id);
					if (byKey.has(key)) continue;
					const efforts = Array.isArray(item.reasoning?.efforts)
						? item.reasoning.efforts.filter((effort) => effort !== null && typeof effort === 'object' && typeof effort.id === 'string')
						: [];
					const model = {
						key,
						id: item.id,
						name: typeof item.name === 'string' && item.name !== '' ? item.name : item.id,
						efforts,
						defaultEffort: typeof item.reasoning?.defaultEffort === 'string' ? item.reasoning.defaultEffort : undefined,
					};
					byKey.set(key, model);
					models.push(model);
				}
				if (models.length > 0) groups.push({ provider: group.id, name: typeof group.name === 'string' && group.name !== '' ? group.name : group.id, models });
			}
			return { groups, byKey };
		}

		/** Stable selector: the workspace list array itself. */
		const selectWorkspaceItems = (snapshot) => (snapshot !== null && typeof snapshot === 'object' ? snapshot.items : undefined);
		const noWorkspaces = () => undefined;

		/** Choose the effort to keep when a row switches to another model. */
		function pickEffort(model, previous) {
			if (model === undefined) return undefined;
			if (typeof previous === 'string' && previous !== '' && model.efforts.some((effort) => effort.id === previous)) return previous;
			return model.defaultEffort;
		}

		/** The wire payload for one mapping row. */
		function mappingPayload(path, model, effort) {
			const entry = { path, provider: model.provider, model: model.id };
			if (typeof effort === 'string' && effort !== '') entry.reasoningEffort = effort;
			return entry;
		}

		return {
			// The page itself needs only slots + locale, so it appears even in a
			// composition that never mounts a Remote namespace.
			inject: ['slots', 'locale'],
			apply(ctx) {
				// The namespace dictionaries are owned by this feature; the bound
				// translator is only a convenience, so a registration failure still
				// leaves a readable English fallback.
				try {
					ctx.effect(() => ctx.locale.register(NS, 'en', EN));
					ctx.effect(() => ctx.locale.register(NS, 'zh', ZH));
				} catch (error) {
					console.warn('workspace-default-model: locale dictionaries not registered', error);
				}
				let bound = null;
				try {
					bound = ctx.locale.bind(NS);
				} catch (error) {
					console.warn('workspace-default-model: locale namespace not bound', error);
				}
				const activeLocale = () => {
					try {
						const snapshot = ctx.locale.getLocale();
						return snapshot !== null && typeof snapshot === 'object' && typeof snapshot.active === 'string' ? snapshot.active : 'en';
					} catch {
						return 'en';
					}
				};
				const t = (key) => {
					if (bound !== null) {
						try {
							const text = bound(key);
							if (typeof text === 'string' && text !== key) return text;
						} catch {
							// Fall through to the local dictionary.
						}
					}
					const dict = activeLocale().toLowerCase().startsWith('zh') ? ZH : EN;
					return dict[key] ?? EN[key] ?? key;
				};

				// Each Remote namespace is its own Cordis service under the dotted key
				// `remote.<namespace>` (api-gateway's RemoteNamespaceService), so
				// `remote.session` is reachable only from a context that injected that
				// exact key. The child below waits for it, which also removes the
				// mount race: a `dsh.client.inject` edge is prefetch metadata, never
				// apply order.
				let sessionNamespace = null;
				let announceReady = null;
				try {
					ctx.inject(['remote', 'remote.session'], (child) => {
						try {
							const viaGet = child.get('remote.session');
							if (viaGet !== undefined && viaGet !== null) sessionNamespace = viaGet;
						} catch {
							// Fall through to the property path.
						}
						if (sessionNamespace === null) {
							try {
								const viaProperty = child.remote.session;
								if (viaProperty !== undefined && viaProperty !== null) sessionNamespace = viaProperty;
							} catch {
								// The namespace stays unavailable; the page says so.
							}
						}
						if (sessionNamespace !== null && announceReady !== null) announceReady();
						return () => {
							sessionNamespace = null;
						};
					});
				} catch (error) {
					console.warn('workspace-default-model: remote.session watch not installed', error);
				}
				/** Notified when the namespace service appears, so the page can read it. */
				const onNamespaceReady = (listener) => {
					announceReady = listener;
					return () => {
						if (announceReady === listener) announceReady = null;
					};
				};
				const sessionRemoteOf = () => sessionNamespace;
				/** Namespaces the Host actually serves, for the diagnostic line. */
				const servedNamespaces = () => {
					try {
						const configForms = ctx.get('configForms');
						if (configForms === undefined || configForms === null) return undefined;
						const snapshot = configForms.describe().getSnapshot();
						const view = snapshot !== null && typeof snapshot === 'object' ? snapshot.view : undefined;
						const namespaces = view !== null && typeof view === 'object' ? view.namespaces : undefined;
						if (!Array.isArray(namespaces)) return undefined;
						return namespaces
							.map((row) => (row !== null && typeof row === 'object' && typeof row.ns === 'string' ? row.ns : undefined))
							.filter((value) => typeof value === 'string');
					} catch {
						return undefined;
					}
				};

				/** Subscribe to the shared settings form for this namespace. */
				function useForm() {
					const form = React.useMemo(() => {
						const configForms = ctx.get('configForms');
						return configForms === undefined || configForms === null ? null : configForms.get(NS);
					}, []);
					const subscribe = React.useCallback((onChange) => (form === null ? () => {} : form.subscribe(onChange)), [form]);
					const read = React.useCallback(() => (form === null ? null : form.getSnapshot()), [form]);
					return { form, snapshot: React.useSyncExternalStore(subscribe, read, read) };
				}

				/** Load the Host model catalog when the namespace is up, or on demand. */
				function useCatalog() {
					const [state, setState] = React.useState({ status: 'loading', catalog: null, error: null });
					const [nonce, setNonce] = React.useState(0);
					React.useEffect(() => {
						let live = true;
						let timer;
						let attempt = 0;
						const run = async () => {
							attempt += 1;
							try {
								const namespace = sessionRemoteOf();
								if (namespace === null || namespace === undefined) throw new Error('the remote.session namespace is not mounted yet');
								const answer = await namespace.modelCatalog();
								const value = answer !== null && typeof answer === 'object' && 'ok' in answer
									? (answer.ok === true ? answer.value : null)
									: answer;
								if (!live) return;
								if (value === null || value === undefined) {
									const failure = answer !== null && typeof answer === 'object' && answer.error !== undefined ? answer.error : undefined;
									throw new Error(typeof failure?.message === 'string' ? failure.message : 'the model catalog answered nothing');
								}
								setState({ status: 'ready', catalog: value, error: null });
							} catch (error) {
								if (!live) return;
								const message = error instanceof Error ? error.message : String(error);
								if (attempt < 3) {
									setState({ status: 'loading', catalog: null, error: message });
									timer = setTimeout(() => { void run(); }, 900 * attempt);
									return;
								}
								setState({ status: 'error', catalog: null, error: message });
							}
						};
						// The namespace watch fires the moment the service mounts, which is
						// the real readiness signal; the retries only cover a slow mount.
						const off = onNamespaceReady(() => {
							attempt = 0;
							void run();
						});
						void run();
						return () => {
							live = false;
							off();
							if (timer !== undefined) clearTimeout(timer);
						};
					}, [nonce]);
					return { ...state, reload: React.useCallback(() => setNonce((value) => value + 1), []) };
				}

				function Section(props) {
					const { form, snapshot } = useForm();
					const catalogState = useCatalog();
					const hostUseWorkspaces = props !== null && typeof props === 'object' ? props.useWorkspaces : undefined;
					const useWorkspaces = typeof hostUseWorkspaces === 'function' ? hostUseWorkspaces : noWorkspaces;
					// The hook selects `items`; tolerate a host that hands back the whole
					// snapshot instead of the selected slice.
					const selected = useWorkspaces(selectWorkspaceItems);
					const items = Array.isArray(selected) ? selected : (Array.isArray(selected?.items) ? selected.items : []);
					const [draft, setDraft] = React.useState(null);
					const [busy, setBusy] = React.useState(false);
					const [notice, setNotice] = React.useState(null);

					const status = snapshot === null ? 'unavailable' : snapshot.status;
					const writable = snapshot !== null && snapshot.writable === true;
					const hostMappings = readMappings(snapshot === null ? undefined : snapshot.value);
					const current = draft === null ? hostMappings : draft;
					const routes = React.useMemo(() => projectCatalog(catalogState.catalog), [catalogState.catalog]);

					const byPath = new Map();
					for (const mapping of current) {
						const key = normalizePath(mapping.path);
						if (key !== undefined && !byPath.has(key)) byPath.set(key, mapping);
					}
					const rows = [];
					const listed = new Set();
					for (const item of Array.isArray(items) ? items : []) {
						const path = typeof item?.path === 'string' ? item.path : '';
						const key = normalizePath(path);
						if (key === undefined || listed.has(key)) continue;
						listed.add(key);
						rows.push({ key, path, title: typeof item?.title === 'string' ? item.title : '', mapping: byPath.get(key) });
					}
					for (const [key, mapping] of byPath) {
						if (listed.has(key)) continue;
						listed.add(key);
						rows.push({ key, path: mapping.path, title: '', mapping });
					}

					/** The complete mapping list these rows would save. */
					function payload() {
						const out = [];
						for (const row of rows) {
							const mapping = row.mapping;
							if (mapping === undefined || mapping === null) continue;
							out.push(mappingPayload(row.path, { provider: mapping.provider, id: mapping.model }, mapping.reasoningEffort));
						}
						return out;
					}

					const nextPayload = payload();
					const savedPayload = hostMappings.map((mapping) => mappingPayload(mapping.path, { provider: mapping.provider, id: mapping.model }, mapping.reasoningEffort));
					// Compare logically: the row order follows the sidebar, which is
					// not the stored order, and a reordering is not an edit.
					const canonical = (list) => JSON.stringify(list
						.map((entry) => `${normalizePath(entry.path) ?? entry.path}\u0000${entry.provider}\u0000${entry.model}\u0000${entry.reasoningEffort ?? ''}`)
						.sort());
					const dirty = canonical(nextPayload) !== canonical(savedPayload);
					const globalDefault = catalogState.catalog?.default;
					/** Providers whose model list the Host could not load, with its reason. */
					const catalogFailures = catalogState.catalog !== null
						&& typeof catalogState.catalog === 'object'
						&& Array.isArray(catalogState.catalog.failures)
						? catalogState.catalog.failures
						: [];

					function assign(key, path, mapping) {
						const base = current.filter((entry) => normalizePath(entry.path) !== key);
						setDraft(mapping === null ? base : [...base, mapping]);
						setNotice(null);
					}

					async function save() {
						if (form === null || busy || !writable) return;
						setBusy(true);
						setNotice(null);
						try {
							const accepted = await form.set('mappings', nextPayload);
							if (accepted) {
								setDraft(null);
								setNotice({ kind: 'ok', text: t('Saved') });
							} else {
								setNotice({ kind: 'error', text: t('The Host refused this configuration.') });
							}
						} catch (error) {
							setNotice({ kind: 'error', text: `${t('Failed')}: ${error instanceof Error ? error.message : String(error)}` });
						} finally {
							setBusy(false);
						}
					}

					function renderRow(row) {
						const mapping = row.mapping;
						const selectedKey = mapping === undefined || mapping === null ? '' : routeKey(mapping.provider, mapping.model);
						const selectedModel = routes.byKey.get(selectedKey);
						// Only claim a model is missing while the catalogue actually loaded:
						// with no catalogue yet, "not listed" would be a guess.
						const catalogueReady = catalogState.status === 'ready';
						const options = [h('option', { key: '', value: '' }, t('Follow the global default'))];
						if (selectedKey !== '' && selectedModel === undefined) {
							options.push(h('option', { key: selectedKey, value: selectedKey }, catalogueReady
								? `${mapping.provider} · ${mapping.model} (${t('not in the current model list')})`
								: `${mapping.provider} · ${mapping.model}`));
						}
						for (const group of routes.groups) {
							options.push(h('optgroup', { key: group.provider, label: group.name }, group.models.map((model) => h('option', {
								key: model.key,
								value: model.key,
							}, model.name === model.id ? model.id : `${model.name} (${model.id})`))));
						}
						const efforts = selectedModel === undefined ? [] : selectedModel.efforts;
						const controls = [h('select', {
							key: 'model',
							className: 'wdm-select',
							'aria-label': t('Select a model'),
							value: selectedKey,
							// Still usable without a catalogue: the empty choice clears a mapping.
							disabled: busy || !writable,
							onChange: (event) => {
								const value = event.target.value;
								if (value === '') {
									assign(row.key, row.path, null);
									return;
								}
								const model = routes.byKey.get(value);
								if (model === undefined) return;
								const provider = value.slice(0, value.indexOf('\u0000'));
								const effort = pickEffort(model, mapping?.reasoningEffort);
								assign(row.key, row.path, mappingPayload(row.path, { provider, id: model.id }, effort));
							},
						}, options)];
						if (selectedKey !== '' && efforts.length > 0) {
							const storedEffort = typeof mapping.reasoningEffort === 'string' ? mapping.reasoningEffort : '';
							const effortOptions = [
								h('option', { key: '', value: '' }, `${t('Model default')}${selectedModel?.defaultEffort === undefined ? '' : ` (${selectedModel.defaultEffort})`}`),
								...efforts.map((effort) => h('option', { key: effort.id, value: effort.id }, effort.name === undefined || effort.name === '' ? effort.id : `${effort.name} (${effort.id})`)),
							];
							// Keep a stored effort the model no longer advertises visible, so
							// the control never shows a value other than the stored one.
							if (storedEffort !== '' && !efforts.some((effort) => effort.id === storedEffort)) {
								effortOptions.push(h('option', { key: storedEffort, value: storedEffort }, `${storedEffort} (${t('not in the current model list')})`));
							}
							controls.push(h('select', {
								key: 'effort',
								className: 'wdm-select',
								'aria-label': t('Reasoning effort'),
								value: storedEffort,
								disabled: busy || !writable,
								onChange: (event) => {
									const value = event.target.value;
									assign(row.key, row.path, mappingPayload(row.path, { provider: mapping.provider, id: mapping.model }, value === '' ? undefined : value));
								},
							}, effortOptions));
						} else if (selectedKey !== '' && typeof mapping.reasoningEffort === 'string' && mapping.reasoningEffort !== '') {
							// No catalogue means no effort list to choose from, but the stored
							// value must still be visible rather than silently hidden.
							controls.push(h('span', { className: 'wdm-note', key: 'effort-readonly' }, `${t('Reasoning effort')}: ${mapping.reasoningEffort}`));
						}
						return h('div', { className: 'wdm-row', key: row.key },
							h('div', { className: 'wdm-row-head' },
								h('span', { className: 'wdm-name' }, row.title === '' ? row.path : row.title),
								row.title === '' ? null : h('span', { className: 'wdm-path' }, row.path)),
							h('div', { className: 'wdm-controls' }, controls));
					}

					const notices = [];
					if (status === 'loading') notices.push(h('span', { className: 'wdm-note', key: 'loading' }, t('Loading…')));
					if (status === 'unavailable') {
						// The bracketed facts separate "this client cannot write" from
						// "the Host never declared the namespace".
						const served = servedNamespaces();
						const servedText = served === undefined ? 'unknown' : (served.length === 0 ? 'none' : `${served.slice(0, 8).join(',')}${served.length > 8 ? ',…' : ''}`);
						const facts = `configForms=${form === null ? 'missing' : 'ok'}; mode=${snapshot === null ? 'n/a' : snapshot.mode}; served=${servedText}`;
						notices.push(h('span', { className: 'wdm-error', key: 'unavailable' }, form === null
							? t('This page needs the Harness settings service (ctx.configForms), which this client does not provide.')
							: `${t('The Host does not expose the settings namespace "workspace-default-model". Its plugin row is loaded but declared no Config schema — usually @deepseek-ai/schemastery (or its version) could not be resolved inside the running dsh; editing cordis.patch.yml still works.')} [${facts}]`));
					}
					if (status === 'ready' && !writable) notices.push(h('span', { className: 'wdm-warn', key: 'readonly' }, t('The Host document is read-only for this page (remotes cannot write a non-loopback page).')));
					if (catalogState.status === 'error') notices.push(h('span', { className: 'wdm-warn', key: 'catalog' }, `${t('The model list could not be read; stored mappings stay editable.')}${catalogState.error === null ? '' : ` — ${catalogState.error}`}`));
					if (catalogState.status === 'ready' && catalogFailures.length > 0) {
						notices.push(h('span', { className: 'wdm-warn', key: 'catalog-failures' }, `${t('These providers did not answer their model list:')} ${catalogFailures
							.map((failure) => `${failure?.name ?? failure?.id ?? '?'} — ${failure?.message ?? '?'}`)
							.join('; ')}`));
					}
					if (notice !== null) notices.push(h('span', { className: notice.kind === 'ok' ? 'wdm-ok' : 'wdm-error', key: 'notice' }, notice.text));
					if (notice === null && dirty) notices.push(h('span', { className: 'wdm-note', key: 'dirty' }, t('Unsaved changes')));

					return h('div', { className: 'wdm-root' },
						h('style', null, CSS),
						h('div', { className: 'wdm-head' },
							h('h3', null, t('Workspace models')),
							h('p', { className: 'wdm-desc' }, t('New Sessions in a listed directory start on that model instead of the global default. The longest matching directory wins, so a parent directory covers everything beneath it.'))),
						globalDefault === undefined || globalDefault === null
							? null
							: h('div', { className: 'wdm-meta' }, `${t('Global default')}: ${globalDefault.provider} · ${globalDefault.model}`),
						rows.length === 0
							? h('div', { className: 'wdm-note' }, t('No workspaces yet. Open a workspace from the sidebar first.'))
							: h('div', { className: 'wdm-rows' }, rows.map(renderRow)),
						h('div', { className: 'wdm-foot' },
							h('button', {
								type: 'button',
								className: 'wdm-btn wdm-btn-primary',
								disabled: busy || !writable || !dirty,
								onClick: () => { void save(); },
							}, t('Save')),
							h('button', {
								type: 'button',
								className: 'wdm-btn',
								disabled: catalogState.status === 'loading',
								onClick: catalogState.reload,
							}, t('Reload model list')),
							...notices));
				}

				ctx.slots.inject('settings.section', () => ctx.slots.register({
					name: 'settings.section',
					id: NS,
					order: 25,
					label: () => t('Workspace models'),
				}, Section));
			},
		};
	},
});
