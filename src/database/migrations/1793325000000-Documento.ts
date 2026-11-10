import { MigrationInterface, QueryRunner } from 'typeorm';
import { F_TRECHO_BUSCA_SQL } from '../../modules/conhecimento/trecho-busca.js';

export class Documento1793325000000 implements MigrationInterface {
  name = 'Documento1793325000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."status_documento_enum" AS ENUM('PROCESSANDO', 'PRONTO', 'ERRO')`,
    );
    await queryRunner.query(F_TRECHO_BUSCA_SQL);
    await queryRunner.query(
      `CREATE TABLE "documento" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "empresaId" uuid NOT NULL,
         "nome" character varying NOT NULL,
         "mime" character varying NOT NULL,
         "texto" text NOT NULL,
         "status" "public"."status_documento_enum" NOT NULL,
         "motivoErro" text,
         "criadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "atualizadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_documento" PRIMARY KEY ("id")
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_documento_empresa" ON "documento" ("empresaId")`,
    );
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
      `ALTER TABLE "documento" ADD CONSTRAINT "FK_documento_empresa" FOREIGN KEY ("empresaId") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trecho_documento" ADD CONSTRAINT "FK_trecho_documento" FOREIGN KEY ("documentoId") REFERENCES "documento"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "trecho_documento" DROP CONSTRAINT "FK_trecho_documento"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documento" DROP CONSTRAINT "FK_documento_empresa"`,
    );
    await queryRunner.query(`DROP TABLE "trecho_documento"`);
    await queryRunner.query(`DROP TABLE "documento"`);
    await queryRunner.query(`DROP FUNCTION public.f_trecho_busca(text)`);
    await queryRunner.query(`DROP TYPE "public"."status_documento_enum"`);
  }
}
