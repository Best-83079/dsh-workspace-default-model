/**
 * Matching-rule checks for workspace-default-model (imports no Harness package).
 * Run: node test/match.mjs   (from the bundle directory)
 */
import assert from 'node:assert/strict';
import { findMapping, normalizeMappings, sameRoute, sameSelection } from '../match.js';

const mappings = normalizeMappings([
	{ path: 'C:\\work\\my-project', provider: 'dsh-opencode-go', model: 'deepseek-v4-pro', reasoningEffort: 'high' },
	{ path: 'C:/work/another-project/', provider: 'dsh-opencode-go', model: 'deepseek-v4.1-flash' },
	{ path: 'C:\\work', provider: 'strata', model: 'qwen3.8-flash-next-iq3_s' },
	{ path: '   ', provider: 'x', model: 'y' },
	{ path: 'C:\\broken', provider: '', model: 'y' },
]);

assert.equal(mappings.length, 3, 'incomplete entries are dropped');

// Exact directory, mixed separators, and case folding (Windows).
assert.equal(findMapping(mappings, 'C:\\work\\my-project').provider, 'dsh-opencode-go');
assert.equal(findMapping(mappings, 'c:/work/my-project').model, 'deepseek-v4-pro');
// Trailing separator on the session directory.
assert.equal(findMapping(mappings, 'C:\\work\\my-project\\').provider, 'dsh-opencode-go');
// Longest match wins over the parent mapping.
assert.equal(findMapping(mappings, 'C:\\work\\another-project\\worktrees\\x').model, 'deepseek-v4.1-flash');
// A parent mapping still owns deeper directories.
assert.equal(findMapping(mappings, 'C:\\work\\something-else').provider, 'strata');
// A sibling with a shared prefix must not match.
assert.equal(findMapping(mappings, 'C:\\work-backup'), undefined);
// No cwd / unknown directory yields no mapping.
assert.equal(findMapping(mappings, undefined), undefined);
assert.equal(findMapping(mappings, 'D:\\elsewhere'), undefined);

assert.equal(sameRoute({ provider: 'a', model: 'b' }, { provider: 'a', model: 'b', reasoningEffort: 'high' }), true);
assert.equal(sameRoute({ provider: 'a', model: 'b' }, { provider: 'a', model: 'c' }), false);
assert.equal(sameSelection({ provider: 'a', model: 'b' }, { provider: 'a', model: 'b' }), true);
assert.equal(sameSelection({ provider: 'a', model: 'b', reasoningEffort: 'high' }, { provider: 'a', model: 'b' }), false);
assert.equal(sameSelection(null, null), true);

console.log('workspace-default-model: matching checks passed');
