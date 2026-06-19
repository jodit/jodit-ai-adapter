import type { Server, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import Boom from '@hapi/boom';
import type {
	AppConfig,
	AIProvider,
	ITranscriptionSession,
	ITranscriptionUsage,
	UsageStats
} from '../types';
import { logger } from '../helpers/logger';
import { AdapterFactory } from '../adapters/adapter-factory';
import type { BaseAdapter } from '../adapters/base-adapter';
import {
	DEFAULT_API_KEY_PATTERN,
	validateApiKeyFormat,
	validateReferer
} from '../middlewares/auth';

/**
 * Speech-to-text transcription WebSocket endpoint.
 *
 * Mounted at `${routePrefix}/transcribe` (default `/ai/transcribe`). The browser
 * streams binary PCM16 microphone audio over this socket; the server resolves
 * the provider adapter and runs a realtime transcription session
 * (`adapter.openTranscriptionSession`) so the provider key stays server-side.
 * Transcript events (`ready` / `delta` / `final` / `error`) come back as JSON
 * text frames, and audio usage is reported through `config.onUsage` with the
 * same credits cost as text requests.
 *
 * Query params: `provider` (defaults to `openai`), `model`, `language`.
 */

const TRANSCRIBE_PATH_SUFFIX = '/transcribe';

export interface TranscriptionAuthContext {
	/** Validated API key */
	apiKey: string;
	/** User id resolved by `checkAuthentication`, or null when no callback is set */
	userId: string | null;
	/** Referer/Origin of the upgrade request */
	referer: string | undefined;
}

/**
 * Pull the API key and referer out of a raw HTTP upgrade request. Mirrors the
 * sources the HTTP `authMiddleware` accepts (Authorization/x-api-key headers,
 * `apikey`/`key` query params), but works on `IncomingMessage` (no Express
 * `req.query` during an upgrade).
 */
function extractCredentials(req: IncomingMessage): {
	apiKey: string | undefined;
	referer: string | undefined;
} {
	const url = new URL(req.url ?? '', 'http://localhost');

	let apiKey: string | undefined;
	const authHeader = req.headers.authorization;
	if (authHeader?.startsWith('Bearer ')) {
		apiKey = authHeader.substring(7);
	} else if (typeof req.headers['x-api-key'] === 'string') {
		apiKey = req.headers['x-api-key'];
	} else {
		apiKey =
			url.searchParams.get('apikey') ??
			url.searchParams.get('key') ??
			undefined;
	}

	const referer =
		(typeof req.headers.referer === 'string' && req.headers.referer) ||
		(typeof req.headers.origin === 'string' && req.headers.origin) ||
		undefined;

	return { apiKey, referer };
}

/**
 * Authenticate an upgrade request using the same rules as the HTTP middleware
 * (key format, referer requirements, `checkAuthentication`). Throws a Boom error
 * on failure. The external `checkReferer` callback is HTTP-only (it expects an
 * Express `Request`) and is intentionally not invoked here; hosts that need
 * referer allow-listing for the socket should enforce it in their own upgrade
 * handler (see jodit-startup-service).
 */
async function authenticateUpgrade(
	config: AppConfig,
	req: IncomingMessage
): Promise<TranscriptionAuthContext> {
	const { apiKey, referer } = extractCredentials(req);

	if (!apiKey) {
		throw Boom.unauthorized('API key is required');
	}

	const pattern = config.apiKeyPattern ?? DEFAULT_API_KEY_PATTERN;
	if (!validateApiKeyFormat(apiKey, pattern)) {
		throw Boom.unauthorized('Invalid API key format');
	}

	const requireReferer =
		config.requireReferer || Boolean(config.checkReferer);
	if (requireReferer && !referer) {
		throw Boom.forbidden('Referer header is required');
	}
	if (requireReferer && !validateReferer(referer, config.allowedReferers)) {
		throw Boom.forbidden('Referer not allowed');
	}

	let userId: string | null = null;
	if (config.checkAuthentication) {
		userId = await config.checkAuthentication(apiKey, referer, req);
		if (!userId) {
			throw Boom.unauthorized('Authentication failed');
		}
	}

	return { apiKey, userId, referer };
}

/**
 * Reject an upgrade before the WebSocket handshake completes, writing a minimal
 * HTTP response so the client sees the status code/reason instead of a silent
 * socket drop.
 */
function rejectUpgrade(
	socket: Duplex,
	statusCode: number,
	message: string
): void {
	const body = JSON.stringify({ success: false, error: message });
	socket.write(
		`HTTP/1.1 ${statusCode} ${message}\r\n` +
			'Connection: close\r\n' +
			'Content-Type: application/json\r\n' +
			`Content-Length: ${Buffer.byteLength(body)}\r\n` +
			'\r\n' +
			body
	);
	socket.destroy();
}

interface SessionParams {
	provider?: string;
	model?: string;
	language?: string;
	silenceMs?: number;
}

/** Read `provider` / `model` / `language` from the upgrade request URL. */
function parseSessionParams(req: IncomingMessage): SessionParams {
	const url = new URL(req.url ?? '', 'http://localhost');
	const silenceRaw = Number.parseInt(
		url.searchParams.get('silence') ?? '',
		10
	);
	return {
		provider: url.searchParams.get('provider') ?? undefined,
		model: url.searchParams.get('model') ?? undefined,
		language:
			url.searchParams.get('language') ??
			url.searchParams.get('lang') ??
			undefined,
		silenceMs: Number.isFinite(silenceRaw) ? silenceRaw : undefined
	};
}

/** Pick the requested provider, else `openai`, else the first configured one. */
function resolveProviderName(
	config: AppConfig,
	requested?: string
): string | undefined {
	if (requested && config.providers[requested]) {
		return requested;
	}
	if (config.providers.openai) {
		return 'openai';
	}
	return Object.keys(config.providers)[0];
}

function sendError(ws: WebSocket, message: string): void {
	if (ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify({ type: 'error', message }));
	}
	ws.close();
}

/**
 * Convert a finished session's token usage into a credits cost and forward it to
 * `config.onUsage`, reusing the same path as text requests. Audio input tokens
 * are billed at the model's audio rate (see `credit.ts`).
 */
function routeTranscriptionUsage(
	config: AppConfig,
	adapter: BaseAdapter,
	auth: TranscriptionAuthContext,
	provider: string,
	usage: ITranscriptionUsage
): void {
	if (!config.onUsage) {
		return;
	}
	let credits;
	try {
		credits = adapter.calculateCredits(usage.model, usage);
	} catch {
		logger.warn(`No pricing for transcription model: ${usage.model}`);
		return;
	}
	const stats: UsageStats = {
		userId: auth.userId ?? '',
		apiKey: auth.apiKey,
		provider,
		model: usage.model,
		responseId: '',
		promptTokens: usage.inputTokens,
		completionTokens: usage.outputTokens,
		totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
		timestamp: Date.now(),
		duration: 0,
		metadata: {
			kind: 'transcription',
			audioInputTokens: usage.audioInputTokens
		},
		credits
	};
	void Promise.resolve(config.onUsage(stats)).catch((error: unknown) => {
		logger.error('Transcription onUsage callback failed', { error });
	});
}

function handleConnection(
	ws: WebSocket,
	config: AppConfig,
	auth: TranscriptionAuthContext,
	params: SessionParams
): void {
	const providerName = resolveProviderName(config, params.provider);
	const providerConfig = providerName
		? config.providers[providerName]
		: undefined;

	if (!providerName || !providerConfig) {
		logger.warn('Transcription requested with no configured provider');
		sendError(ws, 'No transcription provider configured');
		return;
	}

	let adapter: BaseAdapter;
	try {
		adapter = AdapterFactory.createAdapter(
			providerName as AIProvider,
			providerConfig
		);
	} catch (error) {
		logger.error('Failed to create transcription adapter', { error });
		sendError(ws, 'Transcription provider unavailable');
		return;
	}

	logger.info('Transcription session started', {
		userId: auth.userId ?? 'anonymous',
		provider: providerName,
		model: params.model ?? '(default)'
	});

	// Abort the provider session when the browser socket goes away.
	const controller = new AbortController();
	ws.on('close', () => controller.abort());
	ws.on('error', () => controller.abort());

	const session: ITranscriptionSession = {
		client: ws,
		context: {
			model: params.model,
			language: params.language,
			silenceMs: params.silenceMs
		},
		signal: controller.signal,
		reportUsage: (usage) =>
			routeTranscriptionUsage(config, adapter, auth, providerName, usage)
	};

	adapter.openTranscriptionSession(session).catch((error: unknown) => {
		logger.error('Transcription session error', { error });
		sendError(
			ws,
			error instanceof Error ? error.message : 'Transcription failed'
		);
	});
}

/**
 * Attach the transcription WebSocket endpoint to an HTTP server. Works for both
 * the standalone server and a host-provided one (integration mode), so the
 * caller owns the `http.Server` lifecycle.
 *
 * Returns a handle to detach the listener and close the WebSocket server.
 */
export function attachTranscriptionWs(
	server: Server,
	config: AppConfig
): { close: () => void } {
	const wss = new WebSocketServer({ noServer: true });
	const prefix = config.routePrefix ?? '/ai';
	const expectedPath = `${prefix}${TRANSCRIBE_PATH_SUFFIX}`;

	const onUpgrade = (
		req: IncomingMessage,
		socket: Duplex,
		head: Buffer
	): void => {
		const { pathname } = new URL(req.url ?? '', 'http://localhost');

		// Ignore upgrades for other paths so additional WS handlers can coexist
		// on the same server.
		if (pathname !== expectedPath) {
			return;
		}

		authenticateUpgrade(config, req)
			.then((authContext) => {
				const params = parseSessionParams(req);
				wss.handleUpgrade(req, socket, head, (ws) => {
					handleConnection(ws, config, authContext, params);
				});
			})
			.catch((error: unknown) => {
				if (Boom.isBoom(error)) {
					rejectUpgrade(
						socket,
						error.output.statusCode,
						String(error.output.payload.message)
					);
				} else {
					logger.error('Transcription upgrade error', { error });
					rejectUpgrade(socket, 500, 'Internal server error');
				}
			});
	};

	server.on('upgrade', onUpgrade);
	logger.info('Transcription WebSocket enabled', { path: expectedPath });

	return {
		close(): void {
			server.removeListener('upgrade', onUpgrade);
			wss.close();
		}
	};
}
