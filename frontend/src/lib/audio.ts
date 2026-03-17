export interface AudioRuntime {
  context: AudioContext;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  captureNode: AudioWorkletNode;
  playerNode: AudioWorkletNode;
  close: () => Promise<void>;
  enqueueTtsChunk: (chunk: ArrayBuffer) => void;
  softInterrupt: () => void;
  hardInterrupt: () => void;
  resetPlayerGain: () => void;
}

export interface PlaybackEvent {
  type: "queue_depth" | "player_started";
  queuedMs?: number;
}

export interface CaptureCallbacks {
  onAudioChunk: (chunk: ArrayBuffer) => void;
  onVad: (level: number, speaking: boolean) => void;
  onPlaybackEvent?: (event: PlaybackEvent) => void;
}

function pcm16ToFloat32(int16: Int16Array): Float32Array {
  const output = new Float32Array(int16.length);
  for (let index = 0; index < int16.length; index += 1) {
    output[index] = int16[index] / 32768;
  }
  return output;
}

function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) {
    return input;
  }
  const outputLength = Math.max(1, Math.round((input.length * toRate) / fromRate));
  const output = new Float32Array(outputLength);
  const ratio = (input.length - 1) / Math.max(1, outputLength - 1);
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const before = Math.floor(position);
    const after = Math.min(input.length - 1, before + 1);
    const fraction = position - before;
    output[index] = input[before] * (1 - fraction) + input[after] * fraction;
  }
  return output;
}

export function computeLevel(floatData: Float32Array): number {
  if (floatData.length === 0) {
    return 0;
  }
  let total = 0;
  for (let index = 0; index < floatData.length; index += 1) {
    total += Math.abs(floatData[index]);
  }
  return Math.min(1, total / floatData.length / 0.25);
}

export async function createAudioRuntime(callbacks: CaptureCallbacks): Promise<AudioRuntime> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });

  const context = new AudioContext();
  await context.audioWorklet.addModule("/audio/capture-worklet.js");
  await context.audioWorklet.addModule("/audio/player-worklet.js");

  const source = context.createMediaStreamSource(stream);
  const captureNode = new AudioWorkletNode(context, "capture-processor");
  const playerNode = new AudioWorkletNode(context, "player-processor", {
    outputChannelCount: [1],
  });

  captureNode.port.onmessage = (event: MessageEvent) => {
    const payload = event.data;
    if (payload.type === "audio") {
      callbacks.onAudioChunk(payload.buffer as ArrayBuffer);
    } else if (payload.type === "vad") {
      callbacks.onVad(payload.level as number, payload.speaking as boolean);
    }
  };
  playerNode.port.onmessage = (event: MessageEvent) => {
    const payload = event.data;
    if (payload.type === "queue_depth") {
      const queuedSamples = typeof payload.queuedSamples === "number" ? payload.queuedSamples : 0;
      callbacks.onPlaybackEvent?.({
        type: "queue_depth",
        queuedMs: Math.round((queuedSamples / context.sampleRate) * 1000),
      });
    } else if (payload.type === "player_started") {
      callbacks.onPlaybackEvent?.({ type: "player_started" });
    }
  };

  source.connect(captureNode);
  playerNode.connect(context.destination);

  return {
    context,
    stream,
    source,
    captureNode,
    playerNode,
    close: async () => {
      captureNode.port.onmessage = null;
      playerNode.port.onmessage = null;
      captureNode.disconnect();
      source.disconnect();
      playerNode.disconnect();
      for (const track of stream.getTracks()) {
        track.stop();
      }
      await context.close();
    },
    enqueueTtsChunk: (chunk: ArrayBuffer) => {
      const int16 = new Int16Array(chunk);
      const floatChunk = pcm16ToFloat32(int16);
      const resampled = resampleLinear(floatChunk, 24000, context.sampleRate);
      playerNode.port.postMessage(
        {
          type: "enqueue",
          samples: resampled,
        },
        [resampled.buffer],
      );
    },
    softInterrupt: () => {
      playerNode.port.postMessage({ type: "fade_down" });
    },
    hardInterrupt: () => {
      playerNode.port.postMessage({ type: "clear" });
    },
    resetPlayerGain: () => {
      playerNode.port.postMessage({ type: "reset_gain" });
    },
  };
}
