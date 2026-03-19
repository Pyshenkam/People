export interface AudioRuntime {
  context: AudioContext;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  captureNode: AudioWorkletNode;
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

export interface AudioRuntimeOptions {
  playbackTone?: "natural" | "panda_warm";
}

function normalizePlaybackTone(
  playbackTone: AudioRuntimeOptions["playbackTone"],
): "panda_warm" {
  return playbackTone === "natural" ? "panda_warm" : (playbackTone ?? "panda_warm");
}

function createSoftClipCurve(amount: number) {
  const samples = 2048;
  const curve = new Float32Array(new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT));
  for (let index = 0; index < samples; index += 1) {
    const x = (index / (samples - 1)) * 2 - 1;
    curve[index] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  return curve;
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

function createPlaybackChain(
  context: AudioContext,
  playbackTone: AudioRuntimeOptions["playbackTone"],
): {
  inputNode: GainNode;
  gainNode: GainNode;
  disconnect: () => void;
} {
  const inputNode = context.createGain();
  const gainNode = context.createGain();
  gainNode.gain.value = 1;
  const effectiveTone = normalizePlaybackTone(playbackTone);

  if (effectiveTone === "panda_warm") {
    const lowShelf = context.createBiquadFilter();
    lowShelf.type = "lowshelf";
    lowShelf.frequency.value = 165;
    lowShelf.gain.value = 2.2;

    const lowBodyBoost = context.createBiquadFilter();
    lowBodyBoost.type = "peaking";
    lowBodyBoost.frequency.value = 300;
    lowBodyBoost.Q.value = 0.9;
    lowBodyBoost.gain.value = 1.6;

    const lowMidBoost = context.createBiquadFilter();
    lowMidBoost.type = "peaking";
    lowMidBoost.frequency.value = 420;
    lowMidBoost.Q.value = 0.68;
    lowMidBoost.gain.value = 2.6;

    const presenceLift = context.createBiquadFilter();
    presenceLift.type = "peaking";
    presenceLift.frequency.value = 1800;
    presenceLift.Q.value = 0.92;
    presenceLift.gain.value = 1.6;

    const presenceCut = context.createBiquadFilter();
    presenceCut.type = "peaking";
    presenceCut.frequency.value = 3000;
    presenceCut.Q.value = 1;
    presenceCut.gain.value = -1.8;

    const highShelfCut = context.createBiquadFilter();
    highShelfCut.type = "highshelf";
    highShelfCut.frequency.value = 3600;
    highShelfCut.gain.value = -3.8;

    const highSoftener = context.createBiquadFilter();
    highSoftener.type = "lowpass";
    highSoftener.frequency.value = 4300;
    highSoftener.Q.value = 0.7;

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.knee.value = 12;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.18;

    const saturator = context.createWaveShaper();
    saturator.curve = createSoftClipCurve(0.22);
    saturator.oversample = "4x";

    const makeupGain = context.createGain();
    makeupGain.gain.value = 1.08;

    inputNode.connect(lowShelf);
    lowShelf.connect(lowBodyBoost);
    lowBodyBoost.connect(lowMidBoost);
    lowMidBoost.connect(presenceLift);
    presenceLift.connect(presenceCut);
    presenceCut.connect(highShelfCut);
    highShelfCut.connect(highSoftener);
    highSoftener.connect(compressor);
    compressor.connect(saturator);
    saturator.connect(makeupGain);
    makeupGain.connect(gainNode);
    gainNode.connect(context.destination);

    return {
      inputNode,
      gainNode,
      disconnect: () => {
        inputNode.disconnect();
        lowShelf.disconnect();
        lowBodyBoost.disconnect();
        lowMidBoost.disconnect();
        presenceLift.disconnect();
        presenceCut.disconnect();
        highShelfCut.disconnect();
        highSoftener.disconnect();
        compressor.disconnect();
        saturator.disconnect();
        makeupGain.disconnect();
        gainNode.disconnect();
      },
    };
  }

  inputNode.connect(gainNode);
  gainNode.connect(context.destination);
  return {
    inputNode,
    gainNode,
    disconnect: () => {
      inputNode.disconnect();
      gainNode.disconnect();
    },
  };
}

export async function createAudioRuntime(
  callbacks: CaptureCallbacks,
  options: AudioRuntimeOptions = {},
): Promise<AudioRuntime> {
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

  const source = context.createMediaStreamSource(stream);
  const captureNode = new AudioWorkletNode(context, "capture-processor");
  const playbackChain = createPlaybackChain(context, options.playbackTone);
  const effectivePlaybackTone = normalizePlaybackTone(options.playbackTone);
  const playerInputNode = playbackChain.inputNode;
  const playerGainNode = playbackChain.gainNode;
  const activeSources = new Set<AudioBufferSourceNode>();
  const sourceEndTimes = new Map<AudioBufferSourceNode, number>();
  const playbackLeadTimeSec = 0.12;
  let bufferedUntil = context.currentTime;
  let startTimer: number | null = null;
  let didReportStart = false;

  captureNode.port.onmessage = (event: MessageEvent) => {
    const payload = event.data;
    if (payload.type === "audio") {
      callbacks.onAudioChunk(payload.buffer as ArrayBuffer);
    } else if (payload.type === "vad") {
      callbacks.onVad(payload.level as number, payload.speaking as boolean);
    }
  };

  source.connect(captureNode);

  const clearStartTimer = () => {
    if (startTimer !== null) {
      window.clearTimeout(startTimer);
      startTimer = null;
    }
  };

  const emitQueueDepth = () => {
    const queuedMs = Math.max(0, Math.round((bufferedUntil - context.currentTime) * 1000));
    callbacks.onPlaybackEvent?.({
      type: "queue_depth",
      queuedMs,
    });
  };

  const refreshBufferedUntil = () => {
    let latestEnd = context.currentTime;
    for (const endAt of sourceEndTimes.values()) {
      if (endAt > latestEnd) {
        latestEnd = endAt;
      }
    }
    bufferedUntil = latestEnd;
  };

  const resetScheduling = () => {
    clearStartTimer();
    bufferedUntil = context.currentTime;
    didReportStart = false;
  };

  return {
    context,
    stream,
    source,
    captureNode,
    close: async () => {
      captureNode.port.onmessage = null;
      clearStartTimer();
      for (const scheduledSource of activeSources) {
        try {
          scheduledSource.stop();
        } catch {
          // ignore stop failures during teardown
        }
      }
      activeSources.clear();
      sourceEndTimes.clear();
      captureNode.disconnect();
      source.disconnect();
      playbackChain.disconnect();
      for (const track of stream.getTracks()) {
        track.stop();
      }
      await context.close();
    },
    enqueueTtsChunk: (chunk: ArrayBuffer) => {
      const int16 = new Int16Array(chunk);
      const floatChunk = pcm16ToFloat32(int16);
      const resampled = resampleLinear(floatChunk, 24000, context.sampleRate);
      const audioBuffer = context.createBuffer(1, resampled.length, context.sampleRate);
      const channelData = new Float32Array(resampled.length);
      channelData.set(resampled);
      audioBuffer.copyToChannel(channelData, 0);

      const scheduledSource = context.createBufferSource();
      scheduledSource.buffer = audioBuffer;
      scheduledSource.connect(playerInputNode);
      const playbackRate = effectivePlaybackTone === "panda_warm" ? 0.95 : 1;
      scheduledSource.playbackRate.value = playbackRate;

      const startAt = Math.max(context.currentTime + playbackLeadTimeSec, bufferedUntil);
      const endAt = startAt + audioBuffer.duration / playbackRate;
      activeSources.add(scheduledSource);
      sourceEndTimes.set(scheduledSource, endAt);
      bufferedUntil = endAt;

      if (!didReportStart) {
        clearStartTimer();
        startTimer = window.setTimeout(() => {
          didReportStart = true;
          startTimer = null;
          callbacks.onPlaybackEvent?.({ type: "player_started" });
        }, Math.max(0, Math.round((startAt - context.currentTime) * 1000)));
      }

      scheduledSource.onended = () => {
        activeSources.delete(scheduledSource);
        sourceEndTimes.delete(scheduledSource);
        refreshBufferedUntil();
        if (activeSources.size === 0) {
          didReportStart = false;
        }
        emitQueueDepth();
      };

      scheduledSource.start(startAt);
      emitQueueDepth();
    },
    softInterrupt: () => {
      playerGainNode.gain.cancelScheduledValues(context.currentTime);
      playerGainNode.gain.setValueAtTime(playerGainNode.gain.value, context.currentTime);
      playerGainNode.gain.linearRampToValueAtTime(0, context.currentTime + 0.12);
    },
    hardInterrupt: () => {
      clearStartTimer();
      for (const scheduledSource of activeSources) {
        try {
          scheduledSource.stop();
        } catch {
          // ignore stop failures while clearing playback
        }
      }
      activeSources.clear();
      sourceEndTimes.clear();
      resetScheduling();
      emitQueueDepth();
    },
    resetPlayerGain: () => {
      playerGainNode.gain.cancelScheduledValues(context.currentTime);
      playerGainNode.gain.setValueAtTime(1, context.currentTime);
    },
  };
}
