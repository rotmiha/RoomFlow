import "dotenv/config";
import express from "express";
import { resolve } from "node:path";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createApp } from "./app";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const app = express();
const api = createApp(prisma);
app.use("/api", api);
app.use(express.static(resolve("public")));
app.use(api);
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, "0.0.0.0", () => console.log(`RoomFlow listening on port ${port}`));
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => server.close(() => { void prisma.$disconnect(); }));
}
