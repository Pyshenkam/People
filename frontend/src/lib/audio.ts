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

export interface AudioDeviceStatus {
  hasMicrophone: boolean;
  hasSpeaker: boolean;
  microphoneLabel: string;
  speakerLabel: string;
  inputDeviceCount: number;
  outputDeviceCount: number;
}

export class AudioInitError extends Error {
  public readonly code: string;
  public readonly hint: string;

  constructor(code: string, message: string, hint: string) {
    super(message);
    this.name = "AudioInitError";
    this.code = code;
    this.hint = hint;
  }
}

const AUDIO_ERROR_HINTS: Record<string, { message: string; hint: string }> = {
 NotAllowedError: {
    message: "麦克风权限被拒绝",
    hint: "请在 Windows 设置 → 隐私 → 麦克风 中允许应用访问麦克风，并确保该应用的麦克风权限已开启。",
  },
 NotFoundError: {
    message: "未检测到麦克风设备",
    hint: "请检查麦克风是否已连接，或设备驱动是否已安装。一体机可能需要外接麦克风。",
  },
  NotReadableError: {
    message: "麦克风无法读取",
    hint: "麦克风可能被其他程序占用或驱动异常。请关闭其他可能使用麦克风的应用后重试。",
  },
  OverconstrainedError: {
    message: "麦克风不支持所需配置",
    hint: "当前麦克风不支持所需的音频约束，请尝试其他麦克风设备或检查驱动程序。",
  },
  AbortError: {
    message: "音频初始化被中断",
    hint: "音频初始化过程被中断，请重试。如果问题持续，请检查音频服务是否正常。",
  },
  NotSupportedError: {
    message: "浏览器不支持音频功能",
    hint: "当前环境不支持所需的音频 API，请联系管理员。",
  },
  SecurityError: {
    message: "安全策略阻止了音频访问",
    hint: "安全策略阻止了麦克风访问，请检查应用的安全设置。",
  },
};

export function classifyAudioError(error: unknown): AudioInitError {
  if (error instanceof AudioInitError) {
    return error;
  }
  const err = error instanceof Error ? error : new Error(String(error));
  const errorName = err.name;
  const mapping = AUDIO_ERROR_HINTS[errorName];
  if (mapping) {
    return new AudioInitError(errorName, mapping.message, mapping.hint);
  }
  return new AudioInitError("UnknownError", `音频初始化失败: ${err.message}`, "请检查音频设备连接和系统设置，或联系管理员。");
}

export async function checkAudioDevices(): Promise<AudioDeviceStatus> {
  let inputDeviceCount = 0;
  let outputDeviceCount = 0;
  let microphoneLabel = "";
  let speakerLabel = "";

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    for (const device of devices) {
      if (device.kind === "audioinput") {
        inputDeviceCount += 1;
        if (!microphoneLabel && device.label) {
          microphoneLabel = device.label;
        }
      } else if (device.kind === "audiooutput") {
        outputDeviceCount += 1;
        if (!speakerLabel && device.label) {
          speakerLabel = device.label;
        }
      }
    }
  } catch {
    // enumerateDevices 不可用时降级，不阻止后续流程
  }

  const status = {
    hasMicrophone: inputDeviceCount > 0,
    hasSpeaker: outputDeviceCount > 0,
    microphoneLabel,
    speakerLabel,
    inputDeviceCount,
    outputDeviceCount,
  };

  // 写日志到文件
  fileLog("info", `设备检测: 输入=${inputDeviceCount}, 输出=${outputDeviceCount}, 麦克风=${microphoneLabel || "无"}, 扬声器=${speakerLabel || "无"}`);
  if (!status.hasMicrophone) {
    fileLog("error", "未检测到麦克风设备!");
  }
  if (!status.hasSpeaker) {
    fileLog("warn", "未检测到扬声器设备，TTS 可能无法播放");
  }

  return status;
}

/**
 * 写日志到 Electron 主进程日志文件
 */
function fileLog(level: string, message: string): void {
  try {
    const api = (window as unknown as { electronAPI?: { log?: (level: string, message: string) => void } }).electronAPI;
    api?.log?.(level, `[audio] ${message}`);
  } catch {
    // 非 Electron 环境忽略
  }
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
  fileLog("info", "开始创建音频运行时");

  // 预检音频设备
  const deviceStatus = await checkAudioDevices();
  console.info("[audio] Device status:", deviceStatus);

  if (!deviceStatus.hasMicrophone) {
    fileLog("error", "预检失败: 无麦克风设备，中止创建");
    throw new AudioInitError(
      "NoMicrophone",
      "未检测到麦克风设备",
      "请检查麦克风是否已连接或驱动是否已安装。一体机可能没有内置麦克风，需要外接麦克风。",
    );
  }

  if (!deviceStatus.hasSpeaker) {
    fileLog("warn", "预检警告: 无扬声器设备，TTS 可能无法播放声音");
  }

  let stream: MediaStream;
  try {
    fileLog("info", "请求 getUserMedia (带约束: channelCount=1, echoCancellation=true, noiseSuppression=true, autoGainControl=true)");
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    fileLog("info", "getUserMedia 成功 (带约束)");
  } catch (firstError) {
    fileLog("warn", `getUserMedia 带约束失败: ${firstError instanceof Error ? `${firstError.name}: ${firstError.message}` : String(firstError)}`);
    // 带约束的 getUserMedia 失败，可能是其他程序独占了带回声消除的麦克风通道
    // 降级：用最简约束（仅请求音频，不指定任何高级参数）重试
    console.warn("[audio] getUserMedia with constraints failed, retrying with minimal constraints:", firstError);
    try {
      fileLog("info", "降级重试: getUserMedia (audio: true)");
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      fileLog("info", "getUserMedia 降级成功");
      console.info("[audio] getUserMedia succeeded with minimal constraints (fallback)");
    } catch (fallbackError) {
      fileLog("error", `getUserMedia 降级也失败: ${fallbackError instanceof Error ? `${fallbackError.name}: ${fallbackError.message}` : String(fallbackError)}`);
      // 两次都失败，用第一次的错误分类（更有参考价值）
      throw classifyAudioError(firstError);
    }
  }

  // 检查 stream 的音频轨道是否真的有数据
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    stream.getTracks().forEach((t) => t.stop());
    fileLog("error", "获取到的流没有音频轨道");
    throw new AudioInitError(
      "NoAudioTrack",
      "获取到的音频流没有音频轨道",
      "麦克风设备存在但无法创建音频轨道，请检查驱动程序或尝试其他麦克风。",
    );
  }

  const trackInfo = audioTracks.map((t) => ({
    label: t.label,
    enabled: t.enabled,
    muted: t.muted,
    readyState: t.readyState,
    settings: t.getSettings?.(),
  }));
  console.info("[audio] Got audio tracks:", trackInfo);
  fileLog("info", `音频轨道: ${JSON.stringify(trackInfo)}`);
  if (audioTracks.some((t) => t.muted)) {
    fileLog("warn", "音频轨道处于静音(muted)状态，可能麦克风被系统禁用");
  }

  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch (error) {
    stream.getTracks().forEach((t) => t.stop());
    fileLog("error", `AudioContext 创建失败: ${error instanceof Error ? error.message : String(error)}`);
    throw classifyAudioError(error);
  }

  // 检查 AudioContext 状态
  fileLog("info", `AudioContext 创建成功: state=${context.state}, sampleRate=${context.sampleRate}`);
  if (context.state === "suspended") {
    console.warn("[audio] AudioContext created in suspended state, will need resume()");
    fileLog("warn", "AudioContext 处于 suspended 状态，需要用户交互后 resume()");
  }

  try {
    await context.audioWorklet.addModule("/audio/capture-worklet.js");
    fileLog("info", "AudioWorklet 加载成功");
  } catch (error) {
    stream.getTracks().forEach((t) => t.stop());
    await context.close().catch(() => {});
    fileLog("error", `AudioWorklet 加载失败: ${error instanceof Error ? error.message : String(error)}`);
    throw new AudioInitError(
      "WorkletLoadFailed",
      "音频处理模块加载失败",
      `Audio worklet 加载失败: ${error instanceof Error ? error.message : String(error)}。请检查应用安装是否完整。`,
    );
  }

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
