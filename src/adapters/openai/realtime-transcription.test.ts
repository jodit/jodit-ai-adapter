import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { runOpenAITranscriptionSession } from './realtime-transcription.js';
import { OpenAIAdapter } from './openai-adapter.js';
import type {
	ITranscriptionSession,
	ITranscriptionUsage
} from '../../types/index.js';

interface ClientEvent {
	type: string;
	text?: string;
	message?: string;
}

/**
 * A fake OpenAI realtime endpoint. Records the `session.update` and the audio
 * appends it receives, and replays the scripted server events to the socket on
 * the first audio frame.
 */
interface FakeOpenAI {
	url: string;
	sessionUpdates: Array<Record<string, unknown>>;
	audioChunks: string[];
	close: () => Promise<void>;
}

function startFakeOpenAI(
	script: (socket: WebSocket) => void
): Promise<FakeOpenAI> {
	const sessionUpdates: Array<Record<string, unknown>> = [];
	const audioChunks: string[] = [];
	const wss = new WebSocketServer({ port: 0 });

	wss.on('connection', (socket) => {
		socket.on('message', (raw: Buffer) => {
			const msg = JSON.parse(raw.toString()) as {
				type: string;
				audio?: string;
			};
			if (msg.type === 'session.update') {
				sessionUpdates.push(msg as Record<string, unknown>);
			} else if (msg.type === 'input_audio_buffer.append') {
				audioChunks.push(msg.audio ?? '');
				if (audioChunks.length === 1) {
					script(socket);
				}
			}
		});
	});

	return new Promise((resolve) => {
		wss.on('listening', () => {
			const { port } = wss.address() as AddressInfo;
			resolve({
				url: `ws://127.0.0.1:${port}`,
				sessionUpdates,
				audioChunks,
				close: () =>
					new Promise<void>((done) => wss.close(() => done()))
			});
		});
	});
}

/**
 * A transport server that runs one transcription session per connection using
 * `runSession`. Exposes the reported usage and a promise that resolves when the
 * session ends.
 */
interface Transport {
	url: string;
	getUsage: () => ITranscriptionUsage | null;
	ended: Promise<void>;
	close: () => Promise<void>;
}

function startTransport(
	runSession: (session: ITranscriptionSession) => Promise<void>
): Promise<Transport> {
	const wss = new WebSocketServer({ port: 0 });
	let usage: ITranscriptionUsage | null = null;
	let resolveEnded: () => void = () => {};
	const ended = new Promise<void>((resolve) => {
		resolveEnded = resolve;
	});

	wss.on('connection', (socket) => {
		const controller = new AbortController();
		socket.on('close', () => controller.abort());
		void runSession({
			client: socket,
			context: { model: 'gpt-4o-mini-transcribe', language: 'en-US' },
			signal: controller.signal,
			reportUsage: (u) => {
				usage = u;
			}
		}).then(() => resolveEnded());
	});

	return new Promise((resolve) => {
		wss.on('listening', () => {
			const { port } = wss.address() as AddressInfo;
			resolve({
				url: `ws://127.0.0.1:${port}`,
				getUsage: () => usage,
				ended,
				close: () =>
					new Promise<void>((done) => wss.close(() => done()))
			});
		});
	});
}

/** Connect a browser-like client, stream audio on `ready`, collect events. */
function drive(
	url: string,
	stopOn: string
): Promise<{ events: ClientEvent[] }> {
	return new Promise((resolve, reject) => {
		const client = new WebSocket(url);
		client.binaryType = 'arraybuffer';
		const events: ClientEvent[] = [];
		const timer = setTimeout(
			() => reject(new Error('timeout waiting for ' + stopOn)),
			4000
		);
		client.on('message', (raw: Buffer) => {
			const msg = JSON.parse(raw.toString()) as ClientEvent;
			events.push(msg);
			if (msg.type === 'ready') {
				const pcm = new Int16Array(1200).fill(1234);
				client.send(pcm.buffer);
			} else if (msg.type === stopOn) {
				clearTimeout(timer);
				client.close();
				resolve({ events });
			}
		});
		client.on('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}

describe('runOpenAITranscriptionSession', () => {
	it('streams audio upstream and forwards delta/final transcript events', async () => {
		const fake = await startFakeOpenAI((socket) => {
			socket.send(
				JSON.stringify({
					type: 'conversation.item.input_audio_transcription.delta',
					delta: 'Hel'
				})
			);
			socket.send(
				JSON.stringify({
					type: 'conversation.item.input_audio_transcription.delta',
					delta: 'lo'
				})
			);
			socket.send(
				JSON.stringify({
					type: 'conversation.item.input_audio_transcription.completed',
					transcript: 'Hello',
					usage: {
						input_token_details: {
							audio_tokens: 100,
							text_tokens: 5
						},
						input_tokens: 105,
						output_tokens: 2
					}
				})
			);
		});
		const transport = await startTransport((session) =>
			runOpenAITranscriptionSession(session, {
				apiKey: 'test-key',
				url: fake.url
			})
		);

		try {
			const { events } = await drive(transport.url, 'final');
			await transport.ended;

			expect(events.map((e) => e.type)).toEqual([
				'ready',
				'delta',
				'delta',
				'final'
			]);
			expect(
				events.filter((e) => e.type === 'delta').map((e) => e.text)
			).toEqual(['Hel', 'Hello']);
			expect(events.find((e) => e.type === 'final')?.text).toBe('Hello');

			// Upstream received exactly one session.update with our config.
			expect(fake.sessionUpdates).toHaveLength(1);
			const session = fake.sessionUpdates[0].session as {
				type: string;
				audio: {
					input: {
						format: { type: string; rate: number };
						transcription: { model: string; language: string };
						turn_detection: { silence_duration_ms: number };
					};
				};
			};
			expect(session.type).toBe('transcription');
			expect(session.audio.input.transcription.model).toBe(
				'gpt-4o-mini-transcribe'
			);
			expect(session.audio.input.transcription.language).toBe('en');
			expect(session.audio.input.format).toEqual({
				type: 'audio/pcm',
				rate: 24000
			});
			// Default VAD silence (no silenceMs in context).
			expect(session.audio.input.turn_detection.silence_duration_ms).toBe(
				200
			);

			// Audio was forwarded as base64 of the PCM we sent.
			expect(fake.audioChunks.length).toBeGreaterThanOrEqual(1);
			expect(Buffer.from(fake.audioChunks[0], 'base64').length).toBe(
				1200 * 2
			);

			// Usage was reported for billing.
			const usage = transport.getUsage();
			expect(usage?.model).toBe('gpt-4o-mini-transcribe');
			expect(usage?.audioInputTokens).toBe(100);
			expect(usage?.inputTokens).toBe(105);
			expect(usage?.outputTokens).toBe(2);
		} finally {
			await transport.close();
			await fake.close();
		}
	});

	it('forwards upstream error events to the client', async () => {
		const fake = await startFakeOpenAI((socket) => {
			socket.send(
				JSON.stringify({
					type: 'error',
					error: { message: 'bad audio format' }
				})
			);
		});
		const transport = await startTransport((session) =>
			runOpenAITranscriptionSession(session, {
				apiKey: 'test-key',
				url: fake.url
			})
		);

		try {
			const { events } = await drive(transport.url, 'error');
			expect(events.find((e) => e.type === 'error')?.message).toBe(
				'bad audio format'
			);
		} finally {
			await transport.close();
			await fake.close();
		}
	});

	it('OpenAIAdapter.openTranscriptionSession delegates to the realtime session', async () => {
		const fake = await startFakeOpenAI((socket) => {
			socket.send(
				JSON.stringify({
					type: 'conversation.item.input_audio_transcription.completed',
					transcript: 'Delegated'
				})
			);
		});
		const adapter = new OpenAIAdapter({
			apiKey: 'test-key',
			options: { realtimeTranscriptionUrl: fake.url }
		});
		const transport = await startTransport((session) =>
			adapter.openTranscriptionSession(session)
		);

		try {
			const { events } = await drive(transport.url, 'final');
			expect(events.find((e) => e.type === 'final')?.text).toBe(
				'Delegated'
			);
		} finally {
			await transport.close();
			await fake.close();
		}
	});
});
