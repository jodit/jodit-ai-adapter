import type { AIProvider, ProviderConfig } from '../types';
import { BaseAdapter, type BaseAdapterConfig } from './base-adapter';
import { OpenAIAdapter } from './openai-adapter';
import { logger } from '../helpers/logger';

/**
 * Factory for creating AI provider adapters
 */
export class AdapterFactory {
	private static adapters: Map<string, new (config: BaseAdapterConfig) => BaseAdapter> = new Map([
		['openai', OpenAIAdapter]
		// Add other adapters here as they are implemented:
		// ['deepseek', DeepSeekAdapter],
		// ['anthropic', AnthropicAdapter],
		// ['google', GoogleAdapter],
	]);

	/**
	 * Create an adapter instance for the specified provider
	 */
	static createAdapter(
		provider: AIProvider,
		config: ProviderConfig,
	): BaseAdapter {
		const AdapterClass = this.adapters.get(provider);

		if (!AdapterClass) {
			throw new Error(`Unsupported AI provider: ${provider}`);
		}

		// Use user's API key if provided, otherwise use configured key
		const apiKey = config.apiKey;

		if (!apiKey) {
			throw new Error(`API key is required for provider: ${provider}`);
		}

		logger.debug('Creating adapter', {
			provider,
			hasDefaultKey: !!config.apiKey
		});

		return new AdapterClass({
			apiKey,
			apiEndpoint: config.apiEndpoint,
			defaultModel: config.defaultModel,
			httpProxy: config.httpProxy,
			options: config.options
		});
	}

	/**
	 * Get list of supported providers
	 */
	static getSupportedProviders(): AIProvider[] {
		return Array.from(this.adapters.keys()) as AIProvider[];
	}

	/**
	 * Check if provider is supported and enabled
	 */
	static isProviderSupported(provider: string, providerConfig?: ProviderConfig): provider is AIProvider {
		if (!this.adapters.has(provider)) {
			return false;
		}

		if (providerConfig?.enabled === false) {
			return false;
		}

		return true;
	}
}
