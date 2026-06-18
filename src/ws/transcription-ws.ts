import type { Server, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import Boom from '@hapi/boom';
import type { AppConfig } from '../types';
import { logger } from '../helpers/logger';
import {
	DEFAULT_API_KEY_PATTERN,
	validateApiKeyFormat,
	validateReferer
} from '../middlewares/auth';

/**
 * Speech-to-text transcription WebSocket endpoint.
 *
 * Mounted at `${routePrefix}/transcribe` (default `/ai/transcribe`). The browser
 * streams microphone audio over this socket; the server proxies it to OpenAI
 * Realtime transcription so the OpenAI key stays server-side and usage can be
 * metered (added in a later step).
 *
 * This module (A1) provides the authenticated transport scaffold only — the
 * realtime OpenAI session is wired in A3. The handler currently acknowledges
 * readiness and echoes text control frames so the transport can be tested end
 * to end.
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

function handleConnection(
	ws: WebSocket,
	authContext: TranscriptionAuthContext
): void {
	logger.info('Transcription socket opened', {
		userId: authContext.userId ?? 'anonymous'
	});

	ws.send(JSON.stringify({ type: 'ready' }));

	ws.on('message', (data: Buffer, isBinary: boolean) => {
		// A1 placeholder: the realtime OpenAI pipe is added in A3. For now, echo
		// text control frames so the transport can be verified end to end; audio
		// (binary) frames are accepted and ignored.
		if (!isBinary) {
			ws.send(
				JSON.stringify({ type: 'echo', text: data.toString('utf8') })
			);
		}
	});

	ws.on('close', () => {
		logger.info('Transcription socket closed', {
			userId: authContext.userId ?? 'anonymous'
		});
	});

	ws.on('error', (error: Error) => {
		logger.error('Transcription socket error', { error });
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
				wss.handleUpgrade(req, socket, head, (ws) => {
					handleConnection(ws, authContext);
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
