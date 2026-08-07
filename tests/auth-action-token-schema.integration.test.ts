import { Prisma } from "@prisma/client";
import { prisma } from "../src/shared/db/prisma";

type ColumnRow = {
  columnName: string;
  dataType: string;
  maxLength: number | null;
  nullable: "YES" | "NO";
};

type IndexRow = { indexName: string; indexDef: string };
type ConstraintRow = { definition: string };

describe("auth_action_tokens schema contract", () => {
  it("keeps the Prisma model aligned with the durable PostgreSQL table", async () => {
    const model = Prisma.dmmf.datamodel.models.find(
      (candidate) => candidate.name === "AuthActionToken",
    );

    expect(model).toBeDefined();
    expect(model?.dbName).toBe("auth_action_tokens");

    const field = (name: string) => model?.fields.find((item) => item.name === name);
    expect(field("id")?.type).toBe("String");
    expect(field("userId")?.dbName).toBe("user_id");
    expect(field("purpose")?.type).toBe("String");
    expect(field("tokenHash")?.dbName).toBe("token_hash");
    expect(field("expiresAt")?.dbName).toBe("expires_at");
    expect(field("usedAt")?.dbName).toBe("used_at");
    expect(field("createdAt")?.dbName).toBe("created_at");

    const columns = await prisma.$queryRaw<ColumnRow[]>`
      SELECT
        column_name::text AS "columnName",
        data_type::text AS "dataType",
        character_maximum_length::int AS "maxLength",
        is_nullable::text AS "nullable"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'auth_action_tokens'
      ORDER BY ordinal_position
    `;

    expect(columns).toEqual([
      { columnName: "id", dataType: "uuid", maxLength: null, nullable: "NO" },
      { columnName: "user_id", dataType: "uuid", maxLength: null, nullable: "NO" },
      { columnName: "purpose", dataType: "character varying", maxLength: 32, nullable: "NO" },
      { columnName: "token_hash", dataType: "character varying", maxLength: 128, nullable: "NO" },
      { columnName: "expires_at", dataType: "timestamp without time zone", maxLength: null, nullable: "NO" },
      { columnName: "used_at", dataType: "timestamp without time zone", maxLength: null, nullable: "YES" },
      { columnName: "created_at", dataType: "timestamp without time zone", maxLength: null, nullable: "NO" },
    ]);

    const indexes = await prisma.$queryRaw<IndexRow[]>`
      SELECT indexname::text AS "indexName", indexdef::text AS "indexDef"
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'auth_action_tokens'
    `;
    const indexDefinitions = indexes.map((row) => row.indexDef).join("\n");

    expect(indexDefinitions).toContain("auth_action_tokens_pkey");
    expect(indexDefinitions).toContain("auth_action_tokens_token_hash_key");
    expect(indexDefinitions).toContain("auth_action_tokens_user_id_purpose_created_at_idx");
    expect(indexDefinitions).toContain("auth_action_tokens_expires_at_idx");

    const foreignKeys = await prisma.$queryRaw<ConstraintRow[]>`
      SELECT pg_get_constraintdef(c.oid)::text AS definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'auth_action_tokens'
        AND c.contype = 'f'
    `;

    expect(foreignKeys).toHaveLength(1);
    expect(foreignKeys[0].definition).toContain(
      "FOREIGN KEY (user_id) REFERENCES business_users(id) ON UPDATE CASCADE ON DELETE CASCADE",
    );
  });
});
