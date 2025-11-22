import type { Request, Response, NextFunction } from 'express';
import type { AppConfig } from '../types';

/**
 * CORS middleware
 * Handles Cross-Origin Resource Sharing based on configuration
 */
export function corsMiddleware(config: AppConfig) {
	return (req: Request, res: Response, next: NextFunction): void => {
		const origin = req.headers.origin;

		// Determine if origin is allowed
		let allowOrigin = false;

		if (!config.corsOrigin) {
			// No CORS restrictions
			allowOrigin = true;
		} else if (typeof config.corsOrigin === 'string') {
			// Single origin string or wildcard
			if (config.corsOrigin === '*' || config.corsOrigin === origin) {
				allowOrigin = true;
			}
		} else if (Array.isArray(config.corsOrigin)) {
			// Array of allowed origins
			allowOrigin = origin
				? config.corsOrigin.includes(origin)
				: false;
		} else if (config.corsOrigin instanceof RegExp) {
			// RegExp pattern
			allowOrigin = origin ? config.corsOrigin.test(origin) : false;
		}

		if (allowOrigin && origin) {
			res.setHeader('Access-Control-Allow-Origin', origin);
		} else if (
			config.corsOrigin === '*' ||
			config.corsOrigin === undefined
		) {
			res.setHeader('Access-Control-Allow-Origin', '*');
		}

		res.setHeader(
			'Access-Control-Allow-Methods',
			'GET, POST, OPTIONS, PUT, DELETE'
		);
		res.setHeader(
			'Access-Control-Allow-Headers',
			'Content-Type, Authorization, x-api-key'
		);
		res.setHeader('Access-Control-Allow-Credentials', 'true');
		res.setHeader('Access-Control-Max-Age', '86400');

		// Handle preflight requests
		if (req.method === 'OPTIONS') {
			res.status(204).end();
			return;
		}

		next();
	};
}
