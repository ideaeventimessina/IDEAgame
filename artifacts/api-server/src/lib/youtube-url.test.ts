/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* POST /karaoke/download-video: l'URL non deve mai diventare un'opzione di yt-dlp.
     pnpm --filter @workspace/api-server test */

import { test } from "node:test";
import assert from "node:assert/strict";
import { validaUrlYoutube, validaTaglio, argomentiYtDlp } from "./youtube-url.ts";

const MALEVOLI = [
  "--exec=touch /tmp/pwned",
  "--exec touch /tmp/pwned",
  "-o/etc/passwd",
  "--config-location=/tmp/x",
  " --exec=id",
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ --exec id",
  "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "file:///etc/passwd",
  "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
  "https://evil.example/watch?v=dQw4w9WgXcQ",
  "https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ",
  "https://www.youtube.com/watch?v=--exec=id",
  "https://www.youtube.com/watch?v=short",
  "https://www.youtube.com/playlist?list=PL123",
  "https://youtu.be/../../etc",
  "",
  "x".repeat(600),
];

test("URL malevoli o non YouTube: rifiutati", () => {
  for (const u of MALEVOLI) assert.equal(validaUrlYoutube(u).ok, false, u);
  assert.equal(validaUrlYoutube(undefined).ok, false);
  assert.equal(validaUrlYoutube({ toString: () => "https://youtu.be/dQw4w9WgXcQ" }).ok, false);
});

test("URL YouTube validi: ricostruiti in forma canonica", () => {
  const atteso = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  for (const u of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  ]) {
    const r = validaUrlYoutube(u);
    assert.ok(r.ok, u);
    if (r.ok) assert.equal(r.url, atteso);
  }
});

test("yt-dlp: l'URL arriva SEMPRE dopo `--`, ed è l'ultimo argomento", () => {
  const r = validaUrlYoutube("https://youtu.be/dQw4w9WgXcQ");
  assert.ok(r.ok);
  if (!r.ok) return;
  const args = argomentiYtDlp(r.url, "/tmp/x/video.mp4");
  assert.equal(args[args.length - 1], r.url);
  assert.equal(args[args.length - 2], "--");
  assert.ok(args.includes("--no-exec"));
  // nessun argomento dopo le opzioni comincia per "-" tranne il separatore
  assert.equal(args.slice(args.indexOf("--") + 1).some((a) => a.startsWith("-")), false);
});

test("tempi di taglio: solo numeri sensati (niente opzioni per ffmpeg)", () => {
  assert.deepEqual(validaTaglio(30, 60), { ok: true, inizio: 30, fine: 60 });
  assert.deepEqual(validaTaglio("30", "60.5"), { ok: true, inizio: 30, fine: 60.5 });
  for (const [a, b] of [["-i /etc/passwd", 10], [10, 5], [-1, 10], [0, 700], [NaN, 10], [undefined, 10], ["1e9", 10]] as const) {
    assert.equal(validaTaglio(a, b).ok, false, `${a}-${b}`);
  }
});
