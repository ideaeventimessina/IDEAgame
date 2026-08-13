/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import fs from "node:fs";
import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";

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

export async function generateImageBuffer(
  prompt: string,
  size: "1024x1024" | "512x512" | "256x256" = "1024x1024"
): Promise<Buffer> {
  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size,
  });
  const base64 = response.data?.[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}

export async function editImages(
  imageFiles: string[],
  prompt: string,
  outputPath?: string
): Promise<Buffer> {
  const images = await Promise.all(
    imageFiles.map((file) =>
      toFile(fs.createReadStream(file), file, {
        type: "image/png",
      })
    )
  );

  const response = await openai.images.edit({
    model: "gpt-image-1",
    image: images,
    prompt,
  });

  const imageBase64 = response.data?.[0]?.b64_json ?? "";
  const imageBytes = Buffer.from(imageBase64, "base64");

  if (outputPath) {
    fs.writeFileSync(outputPath, imageBytes);
  }

  return imageBytes;
}
