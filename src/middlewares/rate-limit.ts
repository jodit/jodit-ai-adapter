import type { Request, Response, NextFunction } from 'express';
import Boom from '@hapi/boom';
import type { IRateLimiter } from '../rate-limiter';
import type { AuthenticatedRequest } from '../types';
import { logger } from '../helpers/logger';

/**
 * Rate limit middleware options
 */
export interface RateLimitMiddlewareOptions {
	/**
	 * Rate limiter instance
	 */
	rateLimiter: IRateLimiter;

	/**
	 * Function to extract key from request (e.g., user ID, IP address)
	 * Defaults to using userId from authenticated request, or IP address
	 */
	keyExtractor?: (req: Request) => string;

	/**
	 * Custom error message
	 */
	message?: string;

	/**
	 * Whether to include rate limit headers in response
	 */
	includeHeaders?: boolean;

	/**
	 * Skip rate limiting for certain requests
	 */
	skip?: (req: Request) => boolean | Promise<boolean>;

	/**
	 * Handler called when rate limit is exceeded
	 */
	onLimitReached?: (req: Request, key: string) => void | Promise<void>;
}

/**
 * Default key extractor
 * Uses user ID if authenticated, otherwise uses IP address
 */
function defaultKeyExtractor(req: Request): string {
	const authReq = req as AuthenticatedRequest;

	// Try to get user ID from authenticated request
	if (authReq.userId) {
		return `user:${authReq.userId}`;
	}

	// Fall back to IP address
	const ip =
		req.ip ||
		req.headers['x-forwarded-for'] ||
		req.headers['x-real-ip'] ||
		req.socket.remoteAddress ||
		'unknown';

	return `ip:${Array.isArray(ip) ? ip[0] : ip}`;
}

/**
 * Create rate limit middleware
 */
export function rateLimitMiddleware(
	options: RateLimitMiddlewareOptions
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
	const {
		rateLimiter,
		keyExtractor = defaultKeyExtractor,
		message = 'Too many requests, please try again later',
		includeHeaders = true,
		skip,
		onLimitReached
	} = options;

	return async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			// Check if should skip
			if (skip && (await skip(req))) {
				next();
				return;
			}

			// Extract key
			const key = keyExtractor(req);

			// Check rate limit
			const result = await rateLimiter.consume(key);

			// Add headers if requested
			if (includeHeaders) {
				res.setHeader('X-RateLimit-Limit', result.limit.toString());
				res.setHeader(
					'X-RateLimit-Remaining',
					result.remaining.toString()
				);
				res.setHeader(
					'X-RateLimit-Reset',
					new Date(Date.now() + result.resetTime).toISOString()
				);
			}

			// Check if allowed
			if (!result.allowed) {
				logger.warn('Rate limit exceeded', {
					key,
					current: result.current,
					limit: result.limit,
					path: req.path,
					method: req.method
				});

				// Call handler if provided
				if (onLimitReached) {
					await onLimitReached(req, key);
				}

				// Add Retry-After header
				const retryAfterSeconds = Math.ceil(result.resetTime / 1000);
				res.setHeader('Retry-After', retryAfterSeconds.toString());

				throw Boom.tooManyRequests(message, {
					limit: result.limit,
					current: result.current,
					resetTime: result.resetTime
				});
			}

			logger.debug('Rate limit check passed', {
				key,
				current: result.current,
				limit: result.limit,
				remaining: result.remaining
			});

			next();
		} catch (error) {
			// If it's a Boom error, pass it through
			if (Boom.isBoom(error)) {
				next(error);
				return;
			}

			// Log error but don't block request
			logger.error('Rate limit middleware error:', error);
			next();
		}
	};
}

/**
 * Create rate limit middleware with custom options
 */
export function createRateLimitMiddleware(
	rateLimiter: IRateLimiter | null,
	options: Partial<Omit<RateLimitMiddlewareOptions, 'rateLimiter'>> = {}
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
	// If no rate limiter, return a no-op middleware
	if (!rateLimiter) {
		logger.info('Rate limiting is disabled');
		return async (
			_req: Request,
			_res: Response,
			next: NextFunction
		): Promise<void> => {
			next();
		};
	}

	return rateLimitMiddleware({
		rateLimiter,
		...options
	});
}
