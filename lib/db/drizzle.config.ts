/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Le tabelle ideax_lavori / ideax_contatto NON sono più filtrate: ora sono
  // dichiarate nello schema (src/schema/ideax.ts), identiche al DDL che il server
  // crea a runtime. Così dev e prod combaciano e il deploy non propone più il DROP.
});
