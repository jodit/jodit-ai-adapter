import { ProxyAgent } from 'undici';
import { logger } from './logger';

/**
 * Create a fetch function with proxy support
 * @param proxyUrl - HTTP/SOCKS5 proxy URL (e.g., http://proxy:8080 or socks5://proxy:1080)
 * @returns Fetch function with proxy configured
 */
export function createProxyFetch(proxyUrl: string): typeof fetch {
	try {
		const proxyAgent = new ProxyAgent(proxyUrl);

		logger.debug('Created proxy agent', { proxyUrl });

		return (url: string | URL | Request, options?: RequestInit) => {
			return fetch(url, {
				...options,
				// @ts-expect-error - undici dispatcher is not in standard RequestInit
				dispatcher: proxyAgent
			});
		};
	} catch (error) {
		logger.error('Failed to create proxy agent:', error);
		throw new Error(
			`Failed to create proxy agent with URL ${proxyUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

/**
 * Create a fetch function with optional proxy support
 * @param proxyUrl - Optional HTTP/SOCKS5 proxy URL
 * @returns Fetch function (with or without proxy)
 */
export function createFetch(proxyUrl?: string): typeof fetch {
	if (proxyUrl) {
		return createProxyFetch(proxyUrl);
	}
	return fetch;
}
