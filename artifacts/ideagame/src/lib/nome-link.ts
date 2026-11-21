/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Il ponte IDEAeventi manda l'ospite su /join/<codice>?nome=<nome>: il nome va già
   scritto nel campo (promessa di ponte-ideaeventi-lib: "sono dentro senza digitare
   niente"). Stesso limite del server: 30 caratteri. */
export function nomeDaLink(search: string): string {
  try {
    const v = new URLSearchParams(search).get("nome") ?? "";
    return v.replace(/\s+/g, " ").trim().slice(0, 30);
  } catch {
    return "";
  }
}
