/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Download YouTube con yt-dlp: ingresso blindato ──────────────────────────
   Prima l'URL del corpo della richiesta finiva così com'era fra gli argomenti di
   yt-dlp: un "URL" come `--exec=comando` veniva letto come OPZIONE ed eseguiva un
   comando sul server. Ora:
     - si accettano solo URL https di YouTube (youtube.com, youtu.be e sottodomini
       noti) con un id video valido, e si ricostruisce un URL canonico nostro;
     - fra le opzioni e l'URL c'è sempre `--` (fine delle opzioni);
     - execFile, mai una shell. */

const HOST_AMMESSI = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);
const ID_VIDEO = /^[A-Za-z0-9_-]{11}$/;

export type EsitoUrl = { ok: true; url: string; videoId: string } | { ok: false; error: string };

export function validaUrlYoutube(grezzo: unknown): EsitoUrl {
  if (typeof grezzo !== "string") return { ok: false, error: "youtubeUrl obbligatorio" };
  const s = grezzo.trim();
  if (!s || s.length > 500) return { ok: false, error: "youtubeUrl non valido" };
  if (/[\s\0]/.test(s)) return { ok: false, error: "youtubeUrl non valido" };
  let u: URL;
  try { u = new URL(s); } catch { return { ok: false, error: "youtubeUrl non valido" }; }
  if (u.protocol !== "https:") return { ok: false, error: "Serve un indirizzo https di YouTube" };
  if (u.username || u.password || u.port) return { ok: false, error: "youtubeUrl non valido" };
  const host = u.hostname.toLowerCase();
  if (!HOST_AMMESSI.has(host)) return { ok: false, error: "Sono ammessi solo video di YouTube" };
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1] ?? null;
  else if (u.pathname === "/watch") id = u.searchParams.get("v");
  else {
    const m = /^\/(?:shorts|embed|live)\/([^/]+)/.exec(u.pathname);
    id = m ? m[1]! : null;
  }
  if (!id || !ID_VIDEO.test(id)) return { ok: false, error: "Id del video YouTube non valido" };
  return { ok: true, url: `https://www.youtube.com/watch?v=${id}`, videoId: id };
}

/** Secondi di taglio: numeri finiti, 0 ≤ inizio < fine, al massimo 10 minuti di clip e 4 ore di posizione. */
export function validaTaglio(inizio: unknown, fine: unknown): { ok: true; inizio: number; fine: number } | { ok: false; error: string } {
  const num = (v: unknown) => typeof v === "number" ? v : (typeof v === "string" && /^\d{1,5}(\.\d{1,3})?$/.test(v) ? Number(v) : Number.NaN);
  const a = num(inizio);
  const b = num(fine);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { ok: false, error: "startSeconds e endSeconds obbligatori (numeri)" };
  if (a < 0 || b > 4 * 3600) return { ok: false, error: "Tempi fuori intervallo" };
  if (b <= a) return { ok: false, error: "endSeconds deve essere maggiore di startSeconds" };
  if (b - a > 600) return { ok: false, error: "La clip può durare al massimo 10 minuti" };
  return { ok: true, inizio: a, fine: b };
}

/** Argomenti di yt-dlp: l'URL (già validato e ricostruito) arriva SEMPRE dopo `--`. */
export function argomentiYtDlp(urlValidato: string, fileUscita: string): string[] {
  return [
    "-f", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]/best",
    "--merge-output-format", "mp4",
    "-o", fileUscita,
    "--no-playlist",
    "--no-warnings",
    "--no-exec",
    "--",
    urlValidato,
  ];
}
