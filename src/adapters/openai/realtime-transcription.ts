import { WebSocket } from 'ws';
import { logger } from '../../helpers/logger';
import type { ITranscriptionSession, ITranscriptionUsage } from '../../types';

/**
 * OpenAI Realtime speech-to-text transcription session.
 *
 * Runs server-side: opens a WebSocket to OpenAI's realtime transcription API
 * (the OpenAI key travels in the `Authorization` header — a server WebSocket can
 * set headers, unlike the browser), forwards the client's binary PCM16 audio as
 * `input_audio_buffer.append`, and translates OpenAI's streaming transcription
 * events back into the client protocol (`ready` / `delta` / `final` / `error`).
 */

const DEFAULT_REALTIME_URL =
	'wss://api.openai.com/v1/realtime?intent=transcription';
const DEFAULT_MODEL = 'gpt-4o-mini-transcribe';
const TARGET_SAMPLE_RATE = 24000;

export interface OpenAIRealtimeTranscriptionOptions {
	apiKey: string;
	/** Realtime WS endpoint; overridable for tests / self-hosted gateways. */
	url?: string;
}

interface OpenAIUsageShape {
	input_token_details?: { audio_tokens?: number; text_tokens?: number };
	input_tokens?: number;
	output_tokens?: number;
}

/**
 * Extract the audio/input/output token counts from an OpenAI realtime usage
 * object. Defensive about the exact shape (the field is refined as OpenAI
 * stabilizes the realtime usage payload); anything missing reads as 0.
 */
function parseUsage(usage: unknown): {
	audio: number;
	input: number;
	output: number;
} {
	const u = (usage ?? {}) as OpenAIUsageShape;
	const audio = u.input_token_details?.audio_tokens ?? 0;
	const text = u.input_token_details?.text_tokens ?? 0;
	const input = u.input_tokens ?? audio + text;
	const output = u.output_tokens ?? 0;
	return { audio, input, output };
}

interface OpenAIServerEvent {
	type?: string;
	delta?: string;
	transcript?: string;
	usage?: unknown;
	error?: { message?: string; code?: string };
}

/**
 * Open and run a single OpenAI realtime transcription session for the given
 * client socket. Resolves when the session ends (client/upstream closed or the
 * session aborted via `session.signal`). Reports accumulated usage exactly once.
 */
export function runOpenAITranscriptionSession(
	session: ITranscriptionSession,
	options: OpenAIRealtimeTranscriptionOptions
): Promise<void> {
	const { client, context, signal } = session;
	const model = context.model || DEFAULT_MODEL;
	const language = (context.language || 'en').split('-')[0].toLowerCase();
	const url = options.url || DEFAULT_REALTIME_URL;

	return new Promise<void>((resolve) => {
		let segment = '';
		let audioInputTokens = 0;
		let inputTokens = 0;
		let outputTokens = 0;
		let finished = false;

		const upstream = new WebSocket(url, {
			headers: { Authorization: `Bearer ${options.apiKey}` }
		});

		const sendToClient = (payload: object): void => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(JSON.stringify(payload));
			}
		};

		const finish = (): void => {
			if (finished) {
				return;
			}
			finished = true;
			signal.removeEventListener('abort', onAbort);
			if (
				upstream.readyState === WebSocket.OPEN ||
				upstream.readyState === WebSocket.CONNECTING
			) {
				upstream.close();
			}
			if (session.reportUsage) {
				const usage: ITranscriptionUsage = {
					model,
					audioInputTokens,
					inputTokens,
					outputTokens
				};
				session.reportUsage(usage);
			}
			resolve();
		};

		const onAbort = (): void => finish();
		signal.addEventListener('abort', onAbort);

		upstream.on('open', () => {
			// GA transcription session: config nested under `audio.input`, audio
			// format is an object (not the legacy `'pcm16'` string), server VAD
			// auto-commits each phrase.
			upstream.send(
				JSON.stringify({
					type: 'session.update',
					session: {
						type: 'transcription',
						audio: {
							input: {
								format: {
									type: 'audio/pcm',
									rate: TARGET_SAMPLE_RATE
								},
								transcription: { model, language },
								turn_detection: {
									type: 'server_vad',
									threshold: 0.5,
									prefix_padding_ms: 300,
									silence_duration_ms: 500
								}
							}
						}
					}
				})
			);
			// Tell the browser the upstream session is live and it can stream audio.
			sendToClient({ type: 'ready' });
		});

		upstream.on('message', (raw: Buffer) => {
			let data: OpenAIServerEvent;
			try {
				data = JSON.parse(raw.toString()) as OpenAIServerEvent;
			} catch {
				return;
			}
			switch (data.type) {
				case 'conversation.item.input_audio_transcription.delta':
					if (typeof data.delta === 'string' && data.delta) {
						segment += data.delta;
						sendToClient({ type: 'delta', text: segment });
					}
					break;
				case 'conversation.item.input_audio_transcription.completed': {
					const text =
						typeof data.transcript === 'string' && data.transcript
							? data.transcript
							: segment;
					if (text) {
						sendToClient({ type: 'final', text });
					}
					segment = '';
					if (data.usage) {
						const u = parseUsage(data.usage);
						audioInputTokens += u.audio;
						inputTokens += u.input;
						outputTokens += u.output;
					}
					break;
				}
				case 'error':
					sendToClient({
						type: 'error',
						message:
							data.error?.message ??
							data.error?.code ??
							'Transcription error'
					});
					break;
			}
		});

		upstream.on('error', (err: Error) => {
			logger.error('OpenAI realtime transcription error', { error: err });
			sendToClient({
				type: 'error',
				message: 'Transcription provider connection error'
			});
			finish();
		});

		upstream.on('close', () => finish());

		// Client → upstream: the browser streams only binary PCM16 audio frames.
		client.on('message', (raw: Buffer, isBinary: boolean) => {
			if (!isBinary || upstream.readyState !== WebSocket.OPEN) {
				return;
			}
			upstream.send(
				JSON.stringify({
					type: 'input_audio_buffer.append',
					audio: raw.toString('base64')
				})
			);
		});

		client.on('close', () => finish());
		client.on('error', () => finish());
	});
}
