import type { LanguageModel } from 'ai';
import type { WebSocket } from 'ws';
import { BaseAdapter } from './base-adapter.js';
import type { CreditsCost, ITranscriptionSession } from '../types/index.js';

/** Minimal concrete adapter that does not override the optional capabilities. */
class TestAdapter extends BaseAdapter {
	calculateCredits(): CreditsCost {
		return {
			credits: 0,
			usdCost: 0,
			inputTokens: 0,
			outputTokens: 0,
			cachedInputTokens: 0
		};
	}

	protected createLanguageModel(): LanguageModel {
		return {} as LanguageModel;
	}

	protected getDefaultFallbackModel(): string {
		return 'test-model';
	}
}

function makeSession(): ITranscriptionSession {
	return {
		client: {} as WebSocket,
		context: {},
		signal: new AbortController().signal
	};
}

describe('BaseAdapter transcription contract', () => {
	it('openTranscriptionSession throws "not supported" by default', async () => {
		const adapter = new TestAdapter({ apiKey: 'test-key' });
		await expect(
			adapter.openTranscriptionSession(makeSession())
		).rejects.toThrow(/not supported/i);
	});

	it('exposes openTranscriptionSession as an overridable method', () => {
		const adapter = new TestAdapter({ apiKey: 'test-key' });
		expect(typeof adapter.openTranscriptionSession).toBe('function');
	});
});
