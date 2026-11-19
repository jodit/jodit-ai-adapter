import { createDeepSeek, type DeepSeekProvider } from '@ai-sdk/deepseek';
import {
	defaultSettingsMiddleware,
	wrapLanguageModel,
	type LanguageModel,
	type ModelMessage
} from 'ai';
import { createFetch } from '../../helpers/proxy';
import type {
	CreditsCost,
	IAIMessage,
	ModelPricing,
	ProviderUsage
} from '../../types';
import { BaseAdapter, type BaseAdapterConfig } from '../base-adapter';
import { calculateTokenCost } from '../token-cost';

// Jodit credits use the published off-peak token rates throughout the day.
const pricing = new Map<string, ModelPricing>([
	['deepseek-flash', { input: 0.15, cachedInput: 0.003, output: 0.6 }],
	['deepseek-v4-pro', { input: 0.66, cachedInput: 0.022, output: 1.98 }]
]);

export class DeepSeekAdapter extends BaseAdapter {
	private readonly provider: DeepSeekProvider;

	constructor(config: BaseAdapterConfig) {
		super(config);
		this.provider = createDeepSeek({
			apiKey: config.apiKey,
			baseURL: config.apiEndpoint,
			fetch: createFetch(config.httpProxy)
		});
	}

	protected getDefaultFallbackModel(): string {
		return 'deepseek-flash';
	}

	protected createLanguageModel(model: string): LanguageModel {
		if (!pricing.has(model)) {
			throw new Error(`Unsupported DeepSeek model: ${model}`);
		}

		return wrapLanguageModel({
			model: this.provider(model),
			middleware: defaultSettingsMiddleware({
				settings: {
					providerOptions: {
						deepseek: { thinking: { type: 'disabled' } }
					}
				}
			})
		});
	}

	protected override convertMessage(message: IAIMessage): ModelMessage[] {
		if (message.role === 'assistant' && message.toolCalls?.length) {
			return [
				{
					role: 'assistant',
					content: [
						...(message.content
							? [{ type: 'text' as const, text: message.content }]
							: []),
						...message.toolCalls.map((call) => ({
							type: 'tool-call' as const,
							toolCallId: call.id,
							toolName: call.name,
							input: call.arguments
						}))
					]
				}
			];
		}
		return super.convertMessage(message);
	}

	calculateCredits(model: string, usage: ProviderUsage): CreditsCost {
		const rates = pricing.get(model);
		if (!rates) {
			throw new Error(`Unknown model pricing: ${model}`);
		}
		return calculateTokenCost(rates, usage);
	}
}
