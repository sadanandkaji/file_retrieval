DROP TABLE IF EXISTS "policy_chunks";

CREATE TABLE "policy_chunks" (
    "id" BIGSERIAL PRIMARY KEY,
    "document_name" TEXT NOT NULL,
    "section_title" TEXT,
    "page_number" INTEGER,
    "content" TEXT NOT NULL,
    "embedding" vector(768) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ON "policy_chunks" USING hnsw (embedding vector_cosine_ops);