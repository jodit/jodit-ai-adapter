# Speech-to-Text (WebSocket)

Jodit AI Adapter exposes a WebSocket endpoint for **streaming speech-to-text**.
The browser streams microphone audio over the socket and the server proxies it to
the provider's realtime transcription API, so the provider key never reaches the
browser and usage can be metered exactly like text AI requests.

!!! info "Implementation status"
    This page documents the **authenticated transport** that is available today.
    The realtime audio→transcript protocol (audio frames in, `delta`/`final`
    transcript events out) and per-credit metering are being added in the
    following releases. The connection contract below (endpoint, auth, lifecycle)
    is stable.

## Endpoint

```
GET ${routePrefix}/transcribe        (default: /ai/transcribe)
Upgrade: websocket
```

The path follows the configured `routePrefix` (default `/ai`), so with the
default configuration the socket URL is:

```
wss://your-host/ai/transcribe?key=<api-key>
```

## Authentication

Authentication happens during the upgrade handshake and uses the **same rules as
the HTTP routes**:

1. **API key** — taken from, in order, `Authorization: Bearer <key>`,
   `x-api-key: <key>`, or the `?key=` / `?apikey=` query parameter.
2. **Format** — validated against `apiKeyPattern` (default 36-char UUID shape).
3. **Referer** — when `requireReferer` (or `allowedReferers`) is configured, the
   `Referer`/`Origin` of the handshake must match.
4. **`checkAuthentication`** — if provided, it is awaited and must return a user
   id; otherwise the handshake is refused.

An unauthenticated handshake is rejected with an HTTP status **before** the
WebSocket opens (the client receives an `unexpected-response`/`error`, not a
silently dropped socket).

!!! note "Referer for the socket"
    The external `checkReferer` callback is HTTP-only (it receives an Express
    `Request`) and is **not** invoked for the WebSocket. Hosts that need referer
    allow-listing on the socket should enforce it in their own upgrade handler
    (for example, jodit-startup-service does this). `requireReferer` +
    `allowedReferers` pattern matching **are** applied.

## Wire protocol

Two frame kinds travel over the socket:

| Direction | Frame type | Payload |
| --- | --- | --- |
| client → server | **binary** | mono **PCM16 little-endian @ 24 kHz** audio chunks |
| server → client | **text (JSON)** | control & transcript events |

Server → client events:

```jsonc
{ "type": "ready" }                 // sent on connect — start streaming audio
{ "type": "delta", "text": "..." }  // interim transcript (partial)
{ "type": "final", "text": "..." }  // committed transcript for a phrase
{ "type": "error", "message": "..." }
```

!!! info "Status"
    `ready` is live today; `delta` / `final` transcript events arrive once the
    realtime provider pipe lands (the socket currently accepts audio frames and
    echoes text frames so the transport can be verified). The frame **format**
    above is stable, so client code written against it will not need to change.

## Sending microphone audio from the browser

Capture the microphone, downsample to PCM16 / 24 kHz, and send each chunk as a
**binary** frame. This mirrors the format the server forwards to the realtime
provider.

```typescript
const socket = new WebSocket(`wss://your-host/ai/transcribe?key=${apiKey}`);
socket.binaryType = 'arraybuffer';

const TARGET_SAMPLE_RATE = 24000;

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function downsample(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (outRate >= inRate) return input;
  const ratio = inRate / outRate;
  const length = Math.round(input.length / ratio);
  const result = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = input[Math.min(Math.round(i * ratio), input.length - 1)];
  }
  return result;
}

socket.addEventListener('open', async () => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
  });

  const ctx = new AudioContext();
  if (ctx.state === 'suspended') await ctx.resume();

  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const zeroGain = ctx.createGain();
  zeroGain.gain.value = 0; // keep the graph running without playback

  processor.onaudioprocess = (e) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    const input = e.inputBuffer.getChannelData(0);
    const pcm = floatTo16BitPCM(
      downsample(input, e.inputBuffer.sampleRate, TARGET_SAMPLE_RATE)
    );
    socket.send(pcm.buffer); // binary audio frame
  };

  source.connect(processor);
  processor.connect(zeroGain);
  zeroGain.connect(ctx.destination);
});

socket.addEventListener('message', (event) => {
  // server → client events are JSON text frames
  if (typeof event.data !== 'string') return;
  const msg = JSON.parse(event.data);
  switch (msg.type) {
    case 'ready':  /* streaming has started */            break;
    case 'delta':  /* show interim transcript: msg.text */ break;
    case 'final':  /* commit transcript: msg.text */       break;
    case 'error':  console.error(msg.message);             break;
  }
});
```

!!! warning "HTTPS required"
    `getUserMedia` only works on secure origins (HTTPS / `localhost`), and the
    socket must be `wss://` in production.

> **Don't hand-roll this in the editor.** The Jodit PRO AI Assistant ships a
> microphone button that wires the capture above into the assistant prompt for
> you (it reuses the editor's `speech-recognize` plumbing). This raw example is
> for non-Jodit integrations or for understanding the protocol.

## Standalone vs. integration

In **standalone** mode (`start()`), the transcription WebSocket is attached to
the server automatically.

In **integration** mode (mounting the adapter onto an existing Express app), the
host owns the `http.Server`, so attach the WebSocket yourself:

```typescript
import { attachTranscriptionWs } from 'jodit-ai-adapter';

const handle = attachTranscriptionWs(httpServer, config);

// later, to detach the upgrade listener and close the WebSocket server:
handle.close();
```

`attachTranscriptionWs` registers an `upgrade` listener that only handles the
`${routePrefix}/transcribe` path and ignores other paths, so it can coexist with
additional WebSocket handlers on the same server.

See also the [Credits System](credits.md) for how transcription usage will be
priced and reported through `onUsage`.
