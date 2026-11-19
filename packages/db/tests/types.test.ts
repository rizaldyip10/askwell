// Type-level checks of the overrides in index.ts. `pnpm typecheck` (tsc) is what enforces
// them; vitest runs this file too, but the assertions do nothing at runtime.
import { describe, expectTypeOf, it } from "vitest";
import type { Database } from "../index";
import type { Database as GeneratedDatabase } from "../types";

type Functions = Database["public"]["Functions"];
type Reserve = Functions["reserve_knowledge_source"];
type ReserveRow = Reserve["Returns"][number];

describe("Database function overrides", () => {
  it("reserve_knowledge_source accepts and returns a null storage key", () => {
    expectTypeOf<Reserve["Args"]["p_storage_key"]>().toEqualTypeOf<string | null>();
    expectTypeOf<ReserveRow["storage_key"]>().toEqualTypeOf<string | null>();
  });

  it("keeps every other reserve_knowledge_source field as generated", () => {
    expectTypeOf<Reserve["Args"]>().toEqualTypeOf<{
      p_max_sources: number;
      p_project_id: string;
      p_status: string;
      p_storage_key: string | null;
      p_title: string;
      p_type: string;
    }>();
    expectTypeOf<ReserveRow>().toEqualTypeOf<{
      created_at: string;
      id: string;
      project_id: string;
      reclaimed_storage_keys: string[];
      status: string;
      storage_key: string | null;
      title: string;
      type: string;
    }>();
  });

  it("leaves other functions and the tables untouched", () => {
    type Generated = GeneratedDatabase["public"];
    expectTypeOf<Functions["match_chunks"]>().toEqualTypeOf<Generated["Functions"]["match_chunks"]>();
    expectTypeOf<Functions["create_project"]>().toEqualTypeOf<Generated["Functions"]["create_project"]>();
    expectTypeOf<keyof Functions>().toEqualTypeOf<keyof Generated["Functions"]>();
    expectTypeOf<Database["public"]["Tables"]>().toEqualTypeOf<Generated["Tables"]>();
  });
});
