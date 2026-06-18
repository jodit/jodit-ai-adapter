import http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { attachTranscriptionWs } from './transcription-ws.js';
import type { AppConfig, UsageStats } from '../types/index.js';

/** 36-char key matching the default `/^[A-F0-9-]{36}$/i` pattern. */
const VALID_KEY = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';

interface ClientEvent {
	type: string;
	text?: string;
	message?: string;
}

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

/** Fake OpenAI realtime endpoint: replays scripted events on the first append. */
function startFakeOpenAI(
	script: (socket: WebSocket) => void
): Promise<{ url: string; close: () => Promise<void> }> {
	const wss = new WebSocketServer({ port: 0 });
	wss.on('connection', (socket) => {
		socket.on('message', (raw: Buffer) => {
			const msg = JSON.parse(raw.toString()) as { type: string };
			if (msg.type === 'input_audio_buffer.append') {
				script(socket);
			}
		});
	});
	return new Promise((resolve) => {
		wss.on('listening', () => {
			const { port } = wss.address() as AddressInfo;
			resolve({
				url: `ws://127.0.0.1:${port}`,
				close: () =>
					new Promise<void>((done) => wss.close(() => done()))
			});
		});
	});
}

async function startServer(
	config: AppConfig
): Promise<{ url: string; close: () => Promise<void> }> {
	const server = http.createServer((_req, res) => {
		res.writeHead(426);
		res.end();
	});
	// Track sockets so teardown can force-destroy a lingering ignored-path upgrade.
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

/**
 * True if no session is established on `url` — the upgrade is ignored (socket
 * hangs until timeout) or the handshake is refused.
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
		ws.on('error', () => finish(true));
	});
}

/** Connect, stream audio on `ready`, collect events until `stopOn` arrives. */
function drive(url: string, stopOn: string): Promise<ClientEvent[]> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(url);
		ws.binaryType = 'arraybuffer';
		const events: ClientEvent[] = [];
		const timer = setTimeout(
			() => reject(new Error('timeout waiting for ' + stopOn)),
			4000
		);
		ws.on('message', (raw: Buffer) => {
			const msg = JSON.parse(raw.toString()) as ClientEvent;
			events.push(msg);
			if (msg.type === 'ready') {
				ws.send(new Int16Array(1200).fill(777).buffer);
			} else if (msg.type === stopOn) {
				clearTimeout(timer);
				ws.close();
				resolve(events);
			}
		});
		ws.on('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}

async function waitFor(condition: () => boolean, ms = 1500): Promise<void> {
	const start = Date.now();
	while (!condition()) {
		if (Date.now() - start > ms) {
			throw new Error('waitFor timed out');
		}
		await new Promise((r) => setTimeout(r, 20));
	}
}

describe('attachTranscriptionWs', () => {
	describe('authentication', () => {
		it('accepts a valid key (handshake upgrades)', async () => {
			const server = await startServer(makeConfig());
			try {
				expect(
					await attempt(
						`${server.url}/ai/transcribe?key=${VALID_KEY}`
					)
				).toBe('open');
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
				expect(await attempt(`${server.url}/ai/transcribe`)).toBe(
					'rejected'
				);
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
				expect(
					await attempt(
						`${server.url}/custom/transcribe?key=${VALID_KEY}`
					)
				).toBe('open');
				expect(
					await staysSilent(
						`${server.url}/ai/transcribe?key=${VALID_KEY}`
					)
				).toBe(true);
			} finally {
				await server.close();
			}
		});
	});

	describe('transcription session', () => {
		it('runs end-to-end through a provider and reports usage', async () => {
			const fake = await startFakeOpenAI((socket) => {
				socket.send(
					JSON.stringify({
						type: 'conversation.item.input_audio_transcription.delta',
						delta: 'Hi'
					})
				);
				socket.send(
					JSON.stringify({
						type: 'conversation.item.input_audio_transcription.completed',
						transcript: 'Hi there',
						usage: {
							input_token_details: {
								audio_tokens: 200,
								text_tokens: 4
							},
							input_tokens: 204,
							output_tokens: 3
						}
					})
				);
			});
			const usageEvents: UsageStats[] = [];
			const server = await startServer(
				makeConfig({
					providers: {
						openai: {
							type: 'openai',
							apiKey: 'sk-test',
							options: { realtimeTranscriptionUrl: fake.url }
						}
					},
					onUsage: (stats) => {
						usageEvents.push(stats);
					}
				})
			);

			try {
				const events = await drive(
					`${server.url}/ai/transcribe?key=${VALID_KEY}&model=gpt-4o-mini-transcribe`,
					'final'
				);
				expect(events.map((e) => e.type)).toContain('ready');
				expect(events.find((e) => e.type === 'final')?.text).toBe(
					'Hi there'
				);

				// Usage is reported when the session ends (client closed on final).
				await waitFor(() => usageEvents.length > 0);
				const stats = usageEvents[0];
				expect(stats.provider).toBe('openai');
				expect(stats.model).toBe('gpt-4o-mini-transcribe');
				expect(stats.credits.audioInputTokens).toBe(200);
				expect(stats.credits.credits).toBeGreaterThan(0);
			} finally {
				await server.close();
				await fake.close();
			}
		});

		it('sends an error frame when no provider is configured', async () => {
			const server = await startServer(makeConfig());
			try {
				const events = await drive(
					`${server.url}/ai/transcribe?key=${VALID_KEY}`,
					'error'
				);
				expect(events.find((e) => e.type === 'error')?.message).toMatch(
					/provider/i
				);
			} finally {
				await server.close();
			}
		});
	});
});
