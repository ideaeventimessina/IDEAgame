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
  // Tabelle gestite DALL'APP a runtime (create table if not exists in artifacts/api-server/src/lib/ideax.ts):
  // Drizzle NON le conosce, quindi senza questo filtro ogni publish proporrebbe di DROPparle (perdita dati).
  // Le escludiamo dal diff delle migrazioni così restano intatte.
  tablesFilter: ["!ideax_lavori", "!ideax_contatto"],
});
