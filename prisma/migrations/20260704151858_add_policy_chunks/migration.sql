CREATE EXTENSION IF NOT EXISTS vector;


DROP TABLE IF EXISTS "policy_chunks";
-- CreateTable
CREATE TABLE "policy_chunks" (
    "id" BIGSERIAL NOT NULL,
    "document_name" TEXT NOT NULL,
    "section_title" TEXT,
    "page_number" INTEGER,
    "content" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_chunks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX ON "policy_chunks" USING hnsw (embedding vector_cosine_ops);
