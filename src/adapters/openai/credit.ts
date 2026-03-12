import type { CreditsCost, ModelPricing, ProviderUsage } from '../../types';
import MODEL_PRICING from './model-pricing.json';

const CREDIT_RATE = 1000; // credits per $1

export function calculateCredits(
	model: string,
	usage: ProviderUsage
): CreditsCost {
	const pricing = (MODEL_PRICING as Record<string, ModelPricing>)[model];

	if (!pricing) {
		throw new Error(`Unknown model pricing: ${model}`);
	}

	const inputTokens = usage.inputTokens ?? usage.promptTokens ?? 0;

	const outputTokens = usage.outputTokens ?? usage.completionTokens ?? 0;

	const cachedInputTokens = usage.cachedInputTokens ?? 0;

	const normalInputTokens = Math.max(0, inputTokens - cachedInputTokens);

	const usdCost =
		(normalInputTokens / 1_000_000) * pricing.input +
		(cachedInputTokens / 1_000_000) * pricing.cachedInput +
		(outputTokens / 1_000_000) * pricing.output;

	const credits = Math.ceil(usdCost * CREDIT_RATE);

	return {
		credits,
		usdCost,
		inputTokens,
		outputTokens,
		cachedInputTokens
	};
}
