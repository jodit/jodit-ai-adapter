import type { CreditsCost, ModelPricing, ProviderUsage } from '../../types';
import { calculateTokenCost } from '../token-cost';
import MODEL_PRICING from './model-pricing.json';

export function calculateCredits(
	model: string,
	usage: ProviderUsage
): CreditsCost {
	const pricing = (MODEL_PRICING as Record<string, ModelPricing>)[model];

	if (!pricing) {
		throw new Error(`Unknown model pricing: ${model}`);
	}

	return calculateTokenCost(pricing, usage);
}
