import type { Request, Response, NextFunction } from 'express';
import Boom from '@hapi/boom';
import type { AppConfig, AuthenticatedRequest } from '../types';
import { logger } from '../helpers/logger';

/**
 * Default API key pattern: 32 characters, A-F, 0-9, and hyphens
 */
const DEFAULT_API_KEY_PATTERN = /^[A-F0-9-]{32}$/i;

/**
 * Extract API key from request
 * Supports Authorization header (Bearer token) and x-api-key header
 */
function extractApiKey(req: Request): string | undefined {
	// Check Authorization header (Bearer token)
	const authHeader = req.headers.authorization;
	if (authHeader?.startsWith('Bearer ')) {
		return authHeader.substring(7);
	}

	// Check x-api-key header
	const apiKeyHeader = req.headers['x-api-key'];
	if (typeof apiKeyHeader === 'string') {
		return apiKeyHeader;
	}

	return undefined;
}

/**
 * Extract referer from request
 */
function extractReferer(req: Request): string | undefined {
	const referer = req.headers.referer;
	const origin = req.headers.origin;

	if (typeof referer === 'string') {
		return referer;
	}

	if (typeof origin === 'string') {
		return origin;
	}

	return undefined;
}

/**
 * Validate API key format
 */
function validateApiKeyFormat(
	apiKey: string,
	pattern: RegExp = DEFAULT_API_KEY_PATTERN
): boolean {
	return pattern.test(apiKey);
}

/**
 * Validate referer against allowed patterns
 */
function validateReferer(
	referer: string | undefined,
	allowedPatterns: RegExp[] | undefined
): boolean {
	if (!referer) {
		return false;
	}

	if (!allowedPatterns || allowedPatterns.length === 0) {
		return true; // No restrictions if not configured
	}

	return allowedPatterns.some((pattern) => pattern.test(referer));
}

/**
 * Authentication middleware
 * Validates API key format and referer, then calls custom auth callback if provided
 */
export function authMiddleware(config: AppConfig) {
	return async (
		req: AuthenticatedRequest,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			// Extract API key
			const apiKey = extractApiKey(req);
			if (!apiKey) {
				throw Boom.unauthorized('API key is required');
			}

			// Validate API key format
			const apiKeyPattern =
				config.apiKeyPattern || DEFAULT_API_KEY_PATTERN;
			if (!validateApiKeyFormat(apiKey, apiKeyPattern)) {
				logger.warn('Invalid API key format', {
					ip: req.ip,
					apiKey: apiKey.substring(0, 8) + '...'
				});
				throw Boom.unauthorized('Invalid API key format');
			}

			// Extract and validate referer
			const referer = extractReferer(req);
			if (config.requireReferer && !referer) {
				throw Boom.forbidden('Referer header is required');
			}

			if (
				config.requireReferer &&
				!validateReferer(referer, config.allowedReferers)
			) {
				logger.warn('Referer not allowed', {
					ip: req.ip,
					referer
				});
				throw Boom.forbidden('Referer not allowed');
			}

			// Call custom authentication callback if provided
			if (config.checkAuthentication) {
				const userId = await config.checkAuthentication(
					apiKey,
					referer,
					req
				);

				if (!userId) {
					logger.warn('Authentication failed', {
						ip: req.ip,
						referer
					});
					throw Boom.unauthorized('Authentication failed');
				}

				// Store user ID in request for later use
				req.userId = userId;
				req.apiKey = apiKey;

				logger.debug('Authentication successful', {
					userId,
					referer
				});
			} else {
				// No custom auth, just store the API key
				req.apiKey = apiKey;
			}

			next();
		} catch (error) {
			if (Boom.isBoom(error)) {
				res.status(error.output.statusCode).json({
					error: error.output.payload.message
				});
			} else {
				logger.error('Authentication error:', error);
				res.status(500).json({
					error: 'Internal server error'
				});
			}
		}
	};
}
