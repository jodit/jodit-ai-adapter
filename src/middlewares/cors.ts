import type { Request, Response, NextFunction } from 'express';
import type { AppConfig } from '../types';

const DEFAULT_METHODS = 'GET, POST, OPTIONS, PUT, DELETE';
const DEFAULT_ALLOWED_HEADERS = 'Content-Type, Authorization, x-api-key, x-requested-with';
const DEFAULT_MAX_AGE = '86400';

/**
 * CORS middleware
 * Handles Cross-Origin Resource Sharing based on configuration
 */
export function corsMiddleware(config: AppConfig) {
	const corsConfig = config.cors;
	const corsOrigin = corsConfig?.origin ?? config.corsOrigin;
	const methods = corsConfig?.methods ?? DEFAULT_METHODS;
	const allowedHeaders =
		corsConfig?.allowedHeaders ?? DEFAULT_ALLOWED_HEADERS;
	const credentials = corsConfig?.credentials ?? true;
	const maxAge = String(corsConfig?.maxAge ?? DEFAULT_MAX_AGE);

	return (req: Request, res: Response, next: NextFunction): void => {
		const origin = req.headers.origin;

		// Determine if origin is allowed
		let allowOrigin = false;

		if (!corsOrigin) {
			// No CORS restrictions
			allowOrigin = true;
		} else if (typeof corsOrigin === 'string') {
			// Single origin string or wildcard
			if (corsOrigin === '*' || corsOrigin === origin) {
				allowOrigin = true;
			}
		} else if (Array.isArray(corsOrigin)) {
			// Array of allowed origins
			allowOrigin = origin ? corsOrigin.includes(origin) : false;
		} else if (corsOrigin instanceof RegExp) {
			// RegExp pattern
			allowOrigin = origin ? corsOrigin.test(origin) : false;
		}

		if (allowOrigin && origin) {
			res.setHeader('Access-Control-Allow-Origin', origin);
		} else if (corsOrigin === '*' || corsOrigin === undefined) {
			res.setHeader('Access-Control-Allow-Origin', '*');
		}

		res.setHeader('Access-Control-Allow-Methods', methods);
		res.setHeader('Access-Control-Allow-Headers', allowedHeaders);
		res.setHeader(
			'Access-Control-Allow-Credentials',
			String(credentials)
		);
		res.setHeader('Access-Control-Max-Age', maxAge);

		// Handle preflight requests
		if (req.method === 'OPTIONS') {
			res.status(204).end();
			return;
		}

		next();
	};
}
