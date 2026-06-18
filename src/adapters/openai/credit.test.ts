import { calculateCredits } from './credit.js';

describe('calculateCredits', () => {
	it('bills audio input tokens at the audio rate and the rest as text', () => {
		// gpt-4o-mini-transcribe: input 1.25, audioInput 1.25, output 5.00 ($/1M).
		// input_tokens (204) includes the 200 audio tokens → 4 text input tokens.
		const cost = calculateCredits('gpt-4o-mini-transcribe', {
			inputTokens: 204,
			audioInputTokens: 200,
			outputTokens: 3
		});

		const expectedUsd =
			(4 / 1_000_000) * 1.25 + // text input
			(200 / 1_000_000) * 1.25 + // audio input
			(3 / 1_000_000) * 5.0; // output
		expect(cost.usdCost).toBeCloseTo(expectedUsd, 10);
		expect(cost.credits).toBe(Math.ceil(expectedUsd * 1000));
		expect(cost.audioInputTokens).toBe(200);
	});

	it('leaves text-model pricing unchanged (no audio tokens)', () => {
		const cost = calculateCredits('gpt-4o-mini', {
			inputTokens: 1000,
			outputTokens: 500,
			cachedInputTokens: 0
		});
		// gpt-4o-mini: input 0.15, output 0.60 ($/1M).
		const expectedUsd = (1000 / 1_000_000) * 0.15 + (500 / 1_000_000) * 0.6;
		expect(cost.usdCost).toBeCloseTo(expectedUsd, 10);
		expect(cost.audioInputTokens).toBeUndefined();
	});

	it('throws for an unknown model', () => {
		expect(() =>
			calculateCredits('no-such-model', { inputTokens: 1 })
		).toThrow(/unknown model/i);
	});
});
