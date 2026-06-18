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

	// Audio input tokens (transcription) are a subset of `inputTokens`, billed at
	// the model's audio rate; whatever remains is billed as text input.
	const audioInputTokens = usage.audioInputTokens ?? 0;

	const normalInputTokens = Math.max(
		0,
		inputTokens - cachedInputTokens - audioInputTokens
	);

	const usdCost =
		(normalInputTokens / 1_000_000) * pricing.input +
		(cachedInputTokens / 1_000_000) * pricing.cachedInput +
		(audioInputTokens / 1_000_000) * (pricing.audioInput ?? 0) +
		(outputTokens / 1_000_000) * pricing.output;

	const credits = Math.ceil(usdCost * CREDIT_RATE);

	const result: CreditsCost = {
		credits,
		usdCost,
		inputTokens,
		outputTokens,
		cachedInputTokens
	};

	// Only surface the audio field for transcription usage, so the cost shape for
	// text/image models stays exactly as before.
	if (audioInputTokens > 0) {
		result.audioInputTokens = audioInputTokens;
	}

	return result;
}
