// Generated Supabase types (packages/db/types.ts). Regenerate with `pnpm db:types`
// (or the Supabase MCP's type generator); never edit types.ts by hand.
import type { Database as GeneratedDatabase } from "./types";

export type {
  CompositeTypes,
  Enums,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "./types";
export { Constants } from "./types";

// ---------------------------------------------------------------------------
// Nullability overrides for Postgres functions.
//
// The generator types every function argument and every `RETURNS TABLE` column as
// non-null, even when SQL accepts or returns null. types.ts stays purely generated, so we
// fix those fields here, on the `Database` that both Supabase clients use.
//
// When a new function has a nullable argument or column (e.g. `save_chat_turn`'s
// `p_conversation_id`), add it to `FunctionOverrides` the same way, and add a check to
// tests/types.test.ts. Override only the fields that really are nullable.
// ---------------------------------------------------------------------------

/** `T` with the keys `K` widened to also accept null. */
type NullableKeys<T, K extends keyof T> = { [P in keyof T]: P extends K ? T[P] | null : T[P] };

type GeneratedFunctions = GeneratedDatabase["public"]["Functions"];
type ReserveKnowledgeSource = GeneratedFunctions["reserve_knowledge_source"];

type FunctionOverrides = {
  // Pasted text has no file: p_storage_key is null, and so is the returned storage_key.
  reserve_knowledge_source: {
    Args: NullableKeys<ReserveKnowledgeSource["Args"], "p_storage_key">;
    Returns: NullableKeys<ReserveKnowledgeSource["Returns"][number], "storage_key">[];
  };
};

/** The generated `Database`, with the function overrides above. Use this, not types.ts. */
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Functions"> & {
    Functions: Omit<GeneratedFunctions, keyof FunctionOverrides> & FunctionOverrides;
  };
};
