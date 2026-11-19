import "server-only";

import OpenAI from "openai";
import { requireEnv } from "../supabase/env";

let client: OpenAI | undefined;

/**
 * The server's OpenAI client. This is the only file that reads OPENAI_API_KEY.
 * Created on first use, never at import time, so `next build` works with no key set.
 */
export function getOpenAI(): OpenAI {
  if (!client) {
    const env = requireEnv("getOpenAI()", { OPENAI_API_KEY: process.env.OPENAI_API_KEY });
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return client;
}
