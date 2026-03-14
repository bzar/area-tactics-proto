import { Router } from "express";
import bcrypt from "bcryptjs";
import { signToken } from "../auth.js";
import type { Db } from "../db.js";

export function authRouter(db: Db) {
  const router = Router();

  router.post("/register", async (req, res) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      res.status(400).json({ error: "username and password required" });
      return;
    }
    const hash = await bcrypt.hash(password as string, 10);
    try {
      const result = db
        .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
        .run(username, hash);
      const userId = result.lastInsertRowid as number;
      res.status(201).json({ token: signToken({ userId, username }) });
    } catch (e: any) {
      if (e.message?.includes("UNIQUE")) {
        res.status(409).json({ error: "Username already taken" });
      } else {
        res.status(500).json({ error: "Internal error" });
      }
    }
  });

  router.post("/login", async (req, res) => {
    const { username, password } = req.body ?? {};
    const user = db
      .prepare("SELECT id, password_hash FROM users WHERE username = ?")
      .get(username) as any;
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const ok = await bcrypt.compare(password as string, user.password_hash);
    if (!ok) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    res.json({ token: signToken({ userId: user.id, username }) });
  });

  return router;
}
