import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Base do RAG: extensão pgvector, tabela única de trechos com vetor e
 * status de indexação em artigos e documentos. O que já existe fica PENDENTE
 * até a primeira indexação.
 */
export class TrechoConhecimento1793352000000 implements MigrationInterface {
  name = 'TrechoConhecimento1793352000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    } catch (error) {
      throw new Error(
        'A extensão pgvector não está disponível neste Postgres. Use a imagem pgvector/pgvector:pg16 (ou instale o pacote postgresql-16-pgvector) e rode as migrations de novo.',
        { cause: error },
      );
    }
    await queryRunner.query(
      `CREATE TYPE "public"."status_indexacao_enum" AS ENUM('PENDENTE', 'PROCESSANDO', 'PRONTO', 'ERRO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."origem_trecho_enum" AS ENUM('ARTIGO', 'DOCUMENTO')`,
    );
    await queryRunner.query(
      `ALTER TABLE "artigo_conhecimento"
         ADD "indexacao" "public"."status_indexacao_enum" NOT NULL DEFAULT 'PENDENTE',
         ADD "motivoIndexacao" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "documento"
         ADD "indexacao" "public"."status_indexacao_enum" NOT NULL DEFAULT 'PENDENTE',
         ADD "motivoIndexacao" text`,
    );
    await queryRunner.query(
      `CREATE TABLE "trecho_conhecimento" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "empresaId" uuid NOT NULL,
         "origem" "public"."origem_trecho_enum" NOT NULL,
         "artigoId" uuid,
         "documentoId" uuid,
         "ordem" integer NOT NULL DEFAULT 0,
         "titulo" text NOT NULL,
         "secao" text,
         "texto" text NOT NULL,
         "hash" character varying(64) NOT NULL,
         "embedding" vector(1536),
         "modeloEmbedding" character varying(100),
         "ativo" boolean NOT NULL DEFAULT true,
         "busca" tsvector GENERATED ALWAYS AS (public.f_trecho_busca(texto)) STORED,
         "criadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "atualizadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_trecho_conhecimento" PRIMARY KEY ("id"),
         CONSTRAINT "CHK_trecho_conhecimento_origem" CHECK (
           ("origem" = 'ARTIGO' AND "artigoId" IS NOT NULL AND "documentoId" IS NULL)
           OR ("origem" = 'DOCUMENTO' AND "documentoId" IS NOT NULL AND "artigoId" IS NULL)
         )
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trecho_conhecimento_empresa" ON "trecho_conhecimento" ("empresaId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trecho_conhecimento_artigo" ON "trecho_conhecimento" ("artigoId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trecho_conhecimento_documento" ON "trecho_conhecimento" ("documentoId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trecho_conhecimento_busca" ON "trecho_conhecimento" USING GIN ("busca")`,
    );
    // Distância de cosseno, a mesma que a busca usa (operador <=>).
    await queryRunner.query(
      `CREATE INDEX "IDX_trecho_conhecimento_embedding" ON "trecho_conhecimento" USING hnsw ("embedding" vector_cosine_ops)`,
    );
    await queryRunner.query(
      `ALTER TABLE "trecho_conhecimento" ADD CONSTRAINT "FK_trecho_conhecimento_empresa" FOREIGN KEY ("empresaId") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trecho_conhecimento" ADD CONSTRAINT "FK_trecho_conhecimento_artigo" FOREIGN KEY ("artigoId") REFERENCES "artigo_conhecimento"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trecho_conhecimento" ADD CONSTRAINT "FK_trecho_conhecimento_documento" FOREIGN KEY ("documentoId") REFERENCES "documento"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "trecho_conhecimento"`);
    await queryRunner.query(
      `ALTER TABLE "documento" DROP COLUMN "motivoIndexacao", DROP COLUMN "indexacao"`,
    );
    await queryRunner.query(
      `ALTER TABLE "artigo_conhecimento" DROP COLUMN "motivoIndexacao", DROP COLUMN "indexacao"`,
    );
    await queryRunner.query(`DROP TYPE "public"."origem_trecho_enum"`);
    await queryRunner.query(`DROP TYPE "public"."status_indexacao_enum"`);
    // A extensão fica: outro banco ou outra aplicação podem usar.
  }
}
