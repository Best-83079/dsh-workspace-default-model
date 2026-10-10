/**
 * Local probe: read the newest Session logs and report the model route each
 * Session actually ran on, so a workspace mapping can be verified from durable
 * evidence instead of from the picker's label.
 *
 * Session logs are append-only zstd streams: one frame per write, so a single
 * `zstdDecompressSync` sees only the first frame. Frames are split on the zstd
 * magic and decompressed one by one.
 *
 * Run: node test/session-route-probe.mjs [count]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { sessionsDir } from './env.mjs';

const SESSIONS = process.env.DSH_SESSIONS_DIR ?? sessionsDir();
const WANTED = Number(process.argv[2] ?? 8);

if (SESSIONS === undefined) {
	console.log('no dsh Session directory found; set DSH_HOME (or DSH_SESSIONS_DIR) and retry');
	process.exit(0);
}

/** Split a concatenated zstd stream on the frame magic and decompress every frame. */
function decompressAllFrames(bytes) {
	const frames = [];
	let start = -1;
	for (let index = 0; index + 3 < bytes.length; index += 1) {
		const magic = bytes[index] === 0x28 && bytes[index + 1] === 0xb5 && bytes[index + 2] === 0x2f && bytes[index + 3] === 0xfd;
		if (!magic) continue;
		if (start >= 0) frames.push(bytes.subarray(start, index));
		start = index;
	}
	if (start >= 0) frames.push(bytes.subarray(start));
	const parts = [];
	for (const frame of frames) {
		try {
			parts.push(zstdDecompressSync(frame).toString('utf8'));
		} catch {
			// A truncated final frame is normal while a Session is being written.
		}
	}
	return parts.join('');
}

/** Every Session log under the home, newest first. */
function sessionLogs() {
	const found = [];
	for (const workspace of readdirSync(SESSIONS)) {
		const workspaceDir = join(SESSIONS, workspace);
		let sessions;
		try {
			sessions = readdirSync(workspaceDir);
		} catch {
			continue;
		}
		for (const session of sessions) {
			const log = join(workspaceDir, session, 'session.v4.jsonl.zstd');
			try {
				found.push({ log, mtimeMs: statSync(log).mtimeMs });
			} catch {
				// Not a Session directory.
			}
		}
	}
	return found.sort((left, right) => right.mtimeMs - left.mtimeMs);
}

/** One route as the log writes it: `provider/model (effort)`. */
function routeOf(value) {
	if (value === undefined || value === null || typeof value !== 'object') return undefined;
	if (typeof value.provider !== 'string' || typeof value.model !== 'string') return undefined;
	return `${value.provider}/${value.model}${typeof value.reasoningEffort === 'string' ? ` (${value.reasoningEffort})` : ''}`;
}

/** The durable facts this probe reports for one Session. */
function inspect(log) {
	const text = decompressAllFrames(readFileSync(log));
	const events = [];
	for (const line of text.split('\n')) {
		if (line.trim() === '') continue;
		try {
			events.push(JSON.parse(line));
		} catch {
			// A partially written trailing line.
		}
	}
	// The Session header carries `cwd` at the top level; every later event nests
	// its payload under `data` (request/header under `data.header`).
	const header = events.find((event) => event.type === 'session');
	const selectionEvent = events.find((event) => event.type === 'model/selection');
	const requestEvent = events.find((event) => event.type === 'request/header');
	return {
		cwd: header?.cwd ?? header?.data?.cwd,
		at: header?.createdAt === undefined ? undefined : new Date(header.createdAt).toISOString(),
		events: events.length,
		requests: events.filter((event) => event.type === 'request/header').length,
		route: routeOf(requestEvent?.data?.header?.config),
		selection: routeOf(selectionEvent?.data),
	};
}

const rows = sessionLogs().slice(0, WANTED).map(({ log }) => {
	try {
		return inspect(log);
	} catch (error) {
		return { cwd: log, error: String(error) };
	}
});

console.log(`newest ${rows.length} Sessions under ${SESSIONS}\n`);
for (const row of rows) {
	console.log(`- ${row.cwd ?? '?'}`);
	console.log(`    created   ${row.at ?? '?'}   events=${row.events ?? '?'} requests=${row.requests ?? '?'}`);
	console.log(`    first request   ${row.route ?? '(no model request logged yet)'}`);
	console.log(`    first selection ${row.selection ?? '(none recorded)'}`);
}
console.log('\nA Session whose directory is mapped should show the mapped route in both lines.');
