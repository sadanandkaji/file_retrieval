-- CreateTable
CREATE TABLE "policy_chunk_relations" (
    "id" BIGSERIAL NOT NULL,
    "document_id" TEXT NOT NULL,
    "from_chunk_id" BIGINT NOT NULL,
    "to_chunk_id" BIGINT NOT NULL,
    "relation_type" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_chunk_relations_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "policy_chunk_relations" ADD CONSTRAINT "policy_chunk_relations_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_chunk_relations" ADD CONSTRAINT "policy_chunk_relations_from_chunk_id_fkey" FOREIGN KEY ("from_chunk_id") REFERENCES "policy_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_chunk_relations" ADD CONSTRAINT "policy_chunk_relations_to_chunk_id_fkey" FOREIGN KEY ("to_chunk_id") REFERENCES "policy_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
