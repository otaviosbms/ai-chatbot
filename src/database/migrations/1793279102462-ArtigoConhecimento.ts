import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  ARTIGO_BUSCA_EXPRESSION,
  F_ARTIGO_BUSCA_SQL,
  F_UNACCENT_SQL,
} from '../../modules/conhecimento/artigo-busca.js';

export class ArtigoConhecimento1793279102462 implements MigrationInterface {
  name = 'ArtigoConhecimento1793279102462';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(F_UNACCENT_SQL);
    await queryRunner.query(
      `CREATE TYPE "public"."artigo_conhecimento_tipo_enum" AS ENUM('PERGUNTA_RESPOSTA', 'INSTRUCAO')`,
    );
    await queryRunner.query(F_ARTIGO_BUSCA_SQL);
    await queryRunner.query(
      `CREATE TABLE "artigo_conhecimento" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "empresaId" uuid NOT NULL,
         "tipo" "public"."artigo_conhecimento_tipo_enum" NOT NULL,
         "titulo" character varying NOT NULL,
         "pergunta" character varying,
         "conteudo" text NOT NULL,
         "tags" text array NOT NULL DEFAULT '{}',
         "ativo" boolean NOT NULL DEFAULT true,
         "busca" tsvector GENERATED ALWAYS AS (${ARTIGO_BUSCA_EXPRESSION}) STORED,
         "criadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "atualizadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_artigo_conhecimento" PRIMARY KEY ("id")
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_artigo_conhecimento_empresa" ON "artigo_conhecimento" ("empresaId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_artigo_conhecimento_busca" ON "artigo_conhecimento" USING GIN ("busca")`,
    );
    await queryRunner.query(
      `ALTER TABLE "artigo_conhecimento" ADD CONSTRAINT "FK_artigo_conhecimento_empresa" FOREIGN KEY ("empresaId") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "artigo_conhecimento" DROP CONSTRAINT "FK_artigo_conhecimento_empresa"`,
    );
    await queryRunner.query(`DROP TABLE "artigo_conhecimento"`);
    await queryRunner.query(
      `DROP FUNCTION public.f_artigo_busca(text, text, text, text[], public.artigo_conhecimento_tipo_enum)`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."artigo_conhecimento_tipo_enum"`,
    );
    await queryRunner.query(`DROP FUNCTION public.f_unaccent(text)`);
  }
}
