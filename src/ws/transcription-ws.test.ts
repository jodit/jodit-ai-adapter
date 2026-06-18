import http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import WebSocket from 'ws';
import { attachTranscriptionWs } from './transcription-ws.js';
import type { AppConfig } from '../types/index.js';

/** 36-char key matching the default `/^[A-F0-9-]{36}$/i` pattern. */
const VALID_KEY = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
	return {
		port: 0,
		debug: false,
		requestTimeout: 1000,
		maxRetries: 0,
		requireReferer: false,
		providers: {},
		checkAuthentication: (apiKey) =>
			apiKey === VALID_KEY ? 'user-1' : null,
		...overrides
	};
}

async function startServer(
	config: AppConfig
): Promise<{ url: string; close: () => Promise<void> }> {
	const server = http.createServer((_req, res) => {
		res.writeHead(426);
		res.end();
	});
	// Track every socket so teardown can force-destroy them. An upgrade on an
	// ignored path leaves a lingering raw socket that would otherwise keep
	// server.close() from completing.
	const sockets = new Set<Socket>();
	server.on('connection', (socket) => {
		sockets.add(socket);
		socket.on('close', () => sockets.delete(socket));
	});
	const handle = attachTranscriptionWs(server, config);
	await new Promise<void>((resolve) => server.listen(0, resolve));
	const { port } = server.address() as AddressInfo;
	return {
		url: `ws://127.0.0.1:${port}`,
		close: () =>
			new Promise<void>((resolve) => {
				handle.close();
				for (const socket of sockets) {
					socket.destroy();
				}
				server.close(() => resolve());
			})
	};
}

/** Resolve 'open' if the handshake succeeds, 'rejected' if it is refused. */
function attempt(
	url: string,
	options?: WebSocket.ClientOptions
): Promise<'open' | 'rejected'> {
	return new Promise((resolve) => {
		const ws = new WebSocket(url, options);
		ws.on('open', () => {
			ws.close();
			resolve('open');
		});
		ws.on('unexpected-response', () => resolve('rejected'));
		ws.on('error', () => resolve('rejected'));
	});
}

/** Connect, expect a `ready` frame, send text, expect it echoed back. */
function readyAndEcho(
	url: string
): Promise<{ ready: boolean; echo: string | null }> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(url);
		let ready = false;
		const timer = setTimeout(() => {
			ws.terminate();
			reject(new Error('timeout waiting for ready/echo'));
		}, 3000);
		ws.on('message', (raw: Buffer) => {
			const msg = JSON.parse(raw.toString()) as {
				type: string;
				text?: string;
			};
			if (msg.type === 'ready') {
				ready = true;
				ws.send('hello');
			} else if (msg.type === 'echo') {
				clearTimeout(timer);
				ws.close();
				resolve({ ready, echo: msg.text ?? null });
			}
		});
		ws.on('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}

/** A small mono PCM16 @24kHz buffer, the format the browser streams as audio. */
function fakePcm16Frame(samples = 1200): ArrayBuffer {
	const pcm = new Int16Array(samples);
	for (let i = 0; i < samples; i++) {
		pcm[i] = Math.round(Math.sin(i / 8) * 0x4000);
	}
	return pcm.buffer;
}

/**
 * Connect, wait for `ready`, stream a few binary audio frames, and report
 * whether the socket stayed open (audio frames must not drop the connection).
 * A1 ignores audio; A3 turns it into transcript events.
 */
function streamAudio(
	url: string,
	frames = 3
): Promise<{ ready: boolean; stillOpen: boolean }> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(url);
		ws.binaryType = 'arraybuffer';
		let ready = false;
		const timer = setTimeout(() => {
			ws.terminate();
			reject(new Error('timeout waiting for ready'));
		}, 3000);
		ws.on('message', (raw: Buffer, isBinary: boolean) => {
			if (isBinary) {
				reject(new Error('unexpected binary frame from server'));
				return;
			}
			const msg = JSON.parse(raw.toString()) as { type: string };
			if (msg.type === 'ready') {
				ready = true;
				for (let i = 0; i < frames; i++) {
					ws.send(fakePcm16Frame());
				}
				// Give the server a tick to (not) react, then check liveness.
				setTimeout(() => {
					const stillOpen = ws.readyState === WebSocket.OPEN;
					clearTimeout(timer);
					ws.close();
					resolve({ ready, stillOpen });
				}, 200);
			}
		});
		ws.on('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}

/**
 * True if no session is established on `url` — either the upgrade is ignored
 * (socket hangs until our timeout) or the handshake is refused. False only if
 * the socket actually opens or emits a frame.
 */
function staysSilent(url: string, ms = 600): Promise<boolean> {
	return new Promise((resolve) => {
		const ws = new WebSocket(url);
		let settled = false;
		const finish = (silent: boolean): void => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			ws.terminate();
			resolve(silent);
		};
		const timer = setTimeout(() => finish(true), ms);
		ws.on('open', () => finish(false));
		ws.on('message', () => finish(false));
		// Refused handshake, or the `terminate()` above → no session. Keep this
		// listener attached so terminate()'s error is handled, not thrown.
		ws.on('error', () => finish(true));
	});
}

describe('attachTranscriptionWs', () => {
	describe('authentication', () => {
		it('accepts a valid key and sends a ready frame, then echoes text', async () => {
			const server = await startServer(makeConfig());
			try {
				const result = await readyAndEcho(
					`${server.url}/ai/transcribe?key=${VALID_KEY}`
				);
				expect(result.ready).toBe(true);
				expect(result.echo).toBe('hello');
			} finally {
				await server.close();
			}
		});

		it('accepts streamed binary audio frames and keeps the socket open', async () => {
			const server = await startServer(makeConfig());
			try {
				const result = await streamAudio(
					`${server.url}/ai/transcribe?key=${VALID_KEY}`
				);
				expect(result.ready).toBe(true);
				expect(result.stillOpen).toBe(true);
			} finally {
				await server.close();
			}
		});

		it('accepts the key via Authorization: Bearer header', async () => {
			const server = await startServer(makeConfig());
			try {
				const result = await attempt(`${server.url}/ai/transcribe`, {
					headers: { authorization: `Bearer ${VALID_KEY}` }
				});
				expect(result).toBe('open');
			} finally {
				await server.close();
			}
		});

		it('rejects a missing key', async () => {
			const server = await startServer(makeConfig());
			try {
				const result = await attempt(`${server.url}/ai/transcribe`);
				expect(result).toBe('rejected');
			} finally {
				await server.close();
			}
		});

		it('rejects a malformed key (fails the format pattern)', async () => {
			const server = await startServer(makeConfig());
			try {
				const result = await attempt(
					`${server.url}/ai/transcribe?key=not-a-valid-key`
				);
				expect(result).toBe('rejected');
			} finally {
				await server.close();
			}
		});

		it('rejects a well-formed key that checkAuthentication denies', async () => {
			const server = await startServer(makeConfig());
			try {
				const result = await attempt(
					`${server.url}/ai/transcribe?key=FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF`
				);
				expect(result).toBe('rejected');
			} finally {
				await server.close();
			}
		});
	});

	describe('referer enforcement', () => {
		it('rejects when a referer is required but absent', async () => {
			const server = await startServer(
				makeConfig({ requireReferer: true })
			);
			try {
				const result = await attempt(
					`${server.url}/ai/transcribe?key=${VALID_KEY}`
				);
				expect(result).toBe('rejected');
			} finally {
				await server.close();
			}
		});

		it('accepts when the referer matches an allowed pattern', async () => {
			const server = await startServer(
				makeConfig({
					requireReferer: true,
					allowedReferers: [/^https:\/\/ok\.example\.com/]
				})
			);
			try {
				const result = await attempt(`${server.url}/ai/transcribe`, {
					headers: {
						authorization: `Bearer ${VALID_KEY}`,
						referer: 'https://ok.example.com/page'
					}
				});
				expect(result).toBe('open');
			} finally {
				await server.close();
			}
		});
	});

	describe('path scoping', () => {
		it('does not hijack upgrades on other paths', async () => {
			const server = await startServer(makeConfig());
			try {
				const silent = await staysSilent(
					`${server.url}/ai/something-else?key=${VALID_KEY}`
				);
				expect(silent).toBe(true);
			} finally {
				await server.close();
			}
		});

		it('honours a custom routePrefix', async () => {
			const server = await startServer(
				makeConfig({ routePrefix: '/custom' })
			);
			try {
				const onCustom = await attempt(
					`${server.url}/custom/transcribe?key=${VALID_KEY}`
				);
				const onDefault = await staysSilent(
					`${server.url}/ai/transcribe?key=${VALID_KEY}`
				);
				expect(onCustom).toBe('open');
				expect(onDefault).toBe(true);
			} finally {
				await server.close();
			}
		});
	});
});
