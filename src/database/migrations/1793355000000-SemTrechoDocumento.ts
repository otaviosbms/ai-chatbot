import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A busca híbrida lê só trecho_conhecimento: os trechos de 700 caracteres da
 * busca antiga saem. Os documentos continuam com o texto completo e voltam a
 * ter trechos na próxima indexação. A função f_trecho_busca fica: a coluna
 * gerada de trecho_conhecimento usa.
 */
export class SemTrechoDocumento1793355000000 implements MigrationInterface {
  name = 'SemTrechoDocumento1793355000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "trecho_documento"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "trecho_documento" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "empresaId" uuid NOT NULL,
         "documentoId" uuid NOT NULL,
         "ordem" integer NOT NULL,
         "texto" text NOT NULL,
         "busca" tsvector GENERATED ALWAYS AS (public.f_trecho_busca(texto)) STORED,
         "criadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "atualizadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_trecho_documento" PRIMARY KEY ("id")
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trecho_documento_empresa" ON "trecho_documento" ("empresaId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trecho_documento_busca" ON "trecho_documento" USING GIN ("busca")`,
    );
    await queryRunner.query(
      `ALTER TABLE "trecho_documento" ADD CONSTRAINT "FK_trecho_documento" FOREIGN KEY ("documentoId") REFERENCES "documento"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
