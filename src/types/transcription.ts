import type { WebSocket } from 'ws';
import type { ProviderUsage } from './express';

/**
 * Per-session transcription options resolved from the client/config. Provider
 * and model are chosen by the caller (like the other adapter handlers); when a
 * field is omitted the adapter falls back to its own default.
 */
export interface ITranscriptionContext {
	/** Provider model id, e.g. `gpt-4o-mini-transcribe`. */
	model?: string;
	/** BCP-47 language hint, e.g. `en-US`. */
	language?: string;
	/**
	 * Silence (ms) the voice-activity detector waits before committing a phrase.
	 * Lower = more frequent interim/final results on shorter pauses. Defaults to
	 * the adapter's value when unset.
	 */
	silenceMs?: number;
}

/**
 * Usage reported by a finished transcription session, used to bill credits.
 * Audio input tokens are billed in addition to any text tokens (see `credit.ts`).
 */
export interface ITranscriptionUsage extends ProviderUsage {
	/** Model actually used for the session. */
	model: string;
	/** Audio input tokens consumed (provider-reported). */
	audioInputTokens?: number;
}

/**
 * Everything a provider adapter needs to run one realtime transcription session.
 *
 * The provider reads binary audio frames from `client`, streams them to its
 * realtime transcription API, and emits JSON transcript events back over the
 * same socket (`{ type: 'delta' | 'final' | 'error', ... }`).
 */
export interface ITranscriptionSession {
	/** Browser-facing WebSocket: binary audio in, JSON transcript events out. */
	client: WebSocket;
	/** Resolved per-session options (model, language). */
	context: ITranscriptionContext;
	/** Aborts the session (client socket closed, server shutdown). */
	signal: AbortSignal;
	/**
	 * Called once when the session ends with the usage to bill. The transport
	 * layer supplies this so transcription reuses the same usage → credits →
	 * `onUsage` path as HTTP requests. Optional so providers can run without
	 * metering (e.g. in tests).
	 */
	reportUsage?: (usage: ITranscriptionUsage) => void;
}
