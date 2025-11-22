import type { AppConfig } from '../types';

/**
 * Default application configuration
 */
export const defaultConfig: AppConfig = {
	port: parseInt(process.env.PORT || '8082', 10),
	debug: process.env.NODE_ENV === 'development',
	requestTimeout: 120000, // 2 minutes
	maxRetries: 3,
	corsOrigin: process.env.CORS_ORIGIN || '*',
	requireReferer: false,
	apiKeyPattern: /^[A-F0-9-]{32}$/i, // 32 characters: A-F, 0-9, hyphens
	providers: {
		openai: {
			type: 'openai',
			apiKey: process.env.OPENAI_API_KEY,
			apiEndpoint: process.env.OPENAI_API_ENDPOINT,
			defaultModel: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o'
		}
		// Add more providers as needed:
		// deepseek: {
		// 	type: 'deepseek',
		// 	apiKey: process.env.DEEPSEEK_API_KEY,
		// 	defaultModel: 'deepseek-chat'
		// },
		// anthropic: {
		// 	type: 'anthropic',
		// 	apiKey: process.env.ANTHROPIC_API_KEY,
		// 	defaultModel: 'claude-3-opus-20240229'
		// }
	}
};
