import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", { id: serial("id").primaryKey(), name: text("name") });