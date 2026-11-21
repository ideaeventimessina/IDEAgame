/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Per `node --test`: il codice del server importa i suoi moduli senza estensione
   ("./risate-missions") o con ".js" (come vuole il bundler esbuild). Node, che
   esegue il TypeScript direttamente, cerca invece il file esatto. Qui, solo per i
   test, un import relativo che non si trova viene ritentato col file .ts. */
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) throw err;
      if (specifier.endsWith(".js")) return nextResolve(specifier.slice(0, -3) + ".ts", context);
      if (!/\.[cm]?[jt]s$/.test(specifier)) return nextResolve(specifier + ".ts", context);
      throw err;
    }
  },
});
