/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";
import { spawn } from "child_process";
import { writeFile, unlink, readFile } from "fs/promises";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import { getAiUsageContext } from "../context";
import { logAiUsage } from "../usage-log";
import { audioChatCostUsd, transcriptionCostUsd } from "../pricing";

/* Chiave diretta OpenAI: le richieste vanno a api.openai.com e le paghi a
   OpenAI, non piu' a crediti Replit. Senza baseURL l'SDK usa l'endpoint
   ufficiale. */
let client: OpenAI | null = null;

function real(): OpenAI {
  if (!client) {
    const key = (process.env.OPENAI_API_KEY ?? "").trim();
    if (!key) {
      throw new Error(
        "OPENAI_API_KEY non impostata: aggiungi la tua chiave OpenAI ai Secrets dell'app.",
      );
    }
    client = new OpenAI({ apiKey: key });
  }
  return client;
}

/* Costruzione pigra: il client nasce alla prima chiamata, non all'import, cosi'
   una chiave mancante fa fallire solo le richieste AI e non l'avvio del server. */
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const c = real() as unknown as Record<string | symbol, unknown>;
    const value = c[prop];
    return typeof value === "function" ? value.bind(c) : value;
  },
});

export type AudioFormat = "wav" | "mp3" | "webm" | "mp4" | "ogg" | "unknown";

/**
 * Detect audio format from buffer magic bytes.
 * Supports: WAV, MP3, WebM (Chrome/Firefox), MP4/M4A/MOV (Safari/iOS), OGG
 */
export function detectAudioFormat(buffer: Buffer): AudioFormat {
  if (buffer.length < 12) return "unknown";

  // WAV: RIFF....WAVE
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return "wav";
  }
  // WebM: EBML header
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return "webm";
  }
  // MP3: ID3 tag or frame sync
  if (
    (buffer[0] === 0xff && (buffer[1] === 0xfb || buffer[1] === 0xfa || buffer[1] === 0xf3)) ||
    (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33)
  ) {
    return "mp3";
  }
  // MP4/M4A/MOV: ....ftyp (Safari/iOS records in these containers)
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    return "mp4";
  }
  // OGG: OggS
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return "ogg";
  }
  return "unknown";
}

/**
 * Convert any audio/video format to WAV using ffmpeg.
 */
export async function convertToWav(audioBuffer: Buffer): Promise<Buffer> {
  const inputPath = join(tmpdir(), `input-${randomUUID()}`);
  const outputPath = join(tmpdir(), `output-${randomUUID()}.wav`);

  try {
    await writeFile(inputPath, audioBuffer);

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i", inputPath,
        "-vn",
        "-f", "wav",
        "-ar", "16000",
        "-ac", "1",
        "-acodec", "pcm_s16le",
        "-y",
        outputPath,
      ]);

      ffmpeg.stderr.on("data", () => {});
      ffmpeg.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
      ffmpeg.on("error", reject);
    });

    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

/**
 * Auto-detect and convert audio to OpenAI-compatible format.
 */
export async function ensureCompatibleFormat(
  audioBuffer: Buffer
): Promise<{ buffer: Buffer; format: "wav" | "mp3" }> {
  const detected = detectAudioFormat(audioBuffer);
  if (detected === "wav") return { buffer: audioBuffer, format: "wav" };
  if (detected === "mp3") return { buffer: audioBuffer, format: "mp3" };
  const wavBuffer = await convertToWav(audioBuffer);
  return { buffer: wavBuffer, format: "wav" };
}

/** Voice Chat: audio-in, audio-out using gpt-audio. */
export async function voiceChat(
  audioBuffer: Buffer,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy",
  inputFormat: "wav" | "mp3" = "wav",
  outputFormat: "wav" | "mp3" = "mp3"
): Promise<{ transcript: string; audioResponse: Buffer }> {
  const audioBase64 = audioBuffer.toString("base64");
  const response = await openai.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice, format: outputFormat },
    messages: [{
      role: "user",
      content: [
        { type: "input_audio", input_audio: { data: audioBase64, format: inputFormat } },
      ],
    }],
  });
  const message = response.choices[0]?.message as any;
  const transcript = message?.audio?.transcript || message?.content || "";
  const audioData = message?.audio?.data ?? "";
  logAudioChatUsage("gpt-audio", "chat.completions (voiceChat)", (response as any).usage);
  return {
    transcript,
    audioResponse: Buffer.from(audioData, "base64"),
  };
}

/** Logga l'utilizzo di una chiamata chat.completions con modalities audio (non-streaming). */
function logAudioChatUsage(model: string, endpoint: string, usage: any): void {
  const textTokensInput = usage?.prompt_tokens_details?.text_tokens ?? usage?.prompt_tokens ?? 0;
  const textTokensOutput = usage?.completion_tokens_details?.text_tokens ?? 0;
  const audioTokensInput = usage?.prompt_tokens_details?.audio_tokens ?? 0;
  const audioTokensOutput = usage?.completion_tokens_details?.audio_tokens ?? usage?.completion_tokens ?? 0;
  const { costUsd, confidence } = audioChatCostUsd(model, { textTokensInput, textTokensOutput, audioTokensInput, audioTokensOutput });
  void logAiUsage({
    ...getAiUsageContext(),
    model, endpoint,
    tokensInput: (usage?.prompt_tokens ?? textTokensInput + audioTokensInput),
    tokensOutput: (usage?.completion_tokens ?? textTokensOutput + audioTokensOutput),
    costUsd,
    metadata: { costConfidence: confidence, textTokensInput, textTokensOutput, audioTokensInput, audioTokensOutput },
  });
}

/** Logga una chiamata in streaming di cui non conosciamo l'usage (nessun costo stimato, solo conteggio). */
function logStreamingCallNoUsage(model: string, endpoint: string): void {
  void logAiUsage({
    ...getAiUsageContext(),
    model, endpoint,
    costUsd: 0,
    metadata: { streaming: true, note: "usage non disponibile per risposte in streaming" },
  });
}

/** Streaming Voice Chat for real-time audio responses. */
export async function voiceChatStream(
  audioBuffer: Buffer,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy",
  inputFormat: "wav" | "mp3" = "wav"
): Promise<AsyncIterable<{ type: "transcript" | "audio"; data: string }>> {
  const audioBase64 = audioBuffer.toString("base64");
  const stream = await openai.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice, format: "pcm16" },
    messages: [{
      role: "user",
      content: [
        { type: "input_audio", input_audio: { data: audioBase64, format: inputFormat } },
      ],
    }],
    stream: true,
  });
  logStreamingCallNoUsage("gpt-audio", "chat.completions (voiceChatStream)");

  return (async function* () {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta as any;
      if (!delta) continue;
      if (delta?.audio?.transcript) {
        yield { type: "transcript", data: delta.audio.transcript };
      }
      if (delta?.audio?.data) {
        yield { type: "audio", data: delta.audio.data };
      }
    }
  })();
}

/** Text-to-Speech using gpt-audio. */
export async function textToSpeech(
  text: string,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy",
  format: "wav" | "mp3" | "flac" | "opus" | "pcm16" = "wav"
): Promise<Buffer> {
  const response = await openai.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice, format },
    messages: [
      { role: "system", content: "You are an assistant that performs text-to-speech." },
      { role: "user", content: `Repeat the following text verbatim: ${text}` },
    ],
  });
  const audioData = (response.choices[0]?.message as any)?.audio?.data ?? "";
  logAudioChatUsage("gpt-audio", "chat.completions (textToSpeech)", (response as any).usage);
  return Buffer.from(audioData, "base64");
}

/** Streaming Text-to-Speech. */
export async function textToSpeechStream(
  text: string,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy"
): Promise<AsyncIterable<string>> {
  const stream = await openai.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice, format: "pcm16" },
    messages: [
      { role: "system", content: "You are an assistant that performs text-to-speech." },
      { role: "user", content: `Repeat the following text verbatim: ${text}` },
    ],
    stream: true,
  });
  logStreamingCallNoUsage("gpt-audio", "chat.completions (textToSpeechStream)");

  return (async function* () {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta as any;
      if (!delta) continue;
      if (delta?.audio?.data) {
        yield delta.audio.data;
      }
    }
  })();
}

/** Speech-to-Text using gpt-4o-mini-transcribe. */
export async function speechToText(
  audioBuffer: Buffer,
  format: "wav" | "mp3" | "webm" = "wav"
): Promise<string> {
  const file = await toFile(audioBuffer, `audio.${format}`);
  const response = await openai.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
  });
  const usage = (response as any).usage;
  const { costUsd, confidence } = transcriptionCostUsd("gpt-4o-mini-transcribe", usage?.input_tokens ?? 0, usage?.output_tokens ?? 0);
  void logAiUsage({
    ...getAiUsageContext(),
    model: "gpt-4o-mini-transcribe", endpoint: "audio.transcriptions",
    tokensInput: usage?.input_tokens ?? 0,
    tokensOutput: usage?.output_tokens ?? 0,
    costUsd,
    metadata: { costConfidence: confidence, usageAvailable: Boolean(usage) },
  });
  return response.text;
}

/** Streaming Speech-to-Text. */
export async function speechToTextStream(
  audioBuffer: Buffer,
  format: "wav" | "mp3" | "webm" = "wav"
): Promise<AsyncIterable<string>> {
  const file = await toFile(audioBuffer, `audio.${format}`);
  const stream = await openai.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
    stream: true,
  });
  logStreamingCallNoUsage("gpt-4o-mini-transcribe", "audio.transcriptions (stream)");

  return (async function* () {
    for await (const event of stream) {
      if (event.type === "transcript.text.delta") {
        yield event.delta;
      }
    }
  })();
}
