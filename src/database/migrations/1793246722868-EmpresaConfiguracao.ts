import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmpresaConfiguracao1793246722868 implements MigrationInterface {
  name = 'EmpresaConfiguracao1793246722868';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "empresa" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "nome" character varying NOT NULL, "ativa" boolean NOT NULL DEFAULT true, "criadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "atualizadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_bee78e8f1760ccf9cff402118a6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."configuracao_modulo_modulo_enum" AS ENUM('ATENDIMENTO_GERAL', 'SAC', 'TRANSFERENCIA_HUMANA', 'BASE_CONHECIMENTO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "configuracao_modulo" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "empresaId" uuid NOT NULL, "modulo" "public"."configuracao_modulo_modulo_enum" NOT NULL, "ativo" boolean NOT NULL, "config" jsonb NOT NULL, "criadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "atualizadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_7af98f4d7cbd60f1ad261b8f006" UNIQUE ("empresaId", "modulo"), CONSTRAINT "PK_7e34a510f080f0c12d306c46ca8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuracao_modulo" ADD CONSTRAINT "FK_2cb75c86dfa1de5a5e529c2242d" FOREIGN KEY ("empresaId") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "configuracao_modulo" DROP CONSTRAINT "FK_2cb75c86dfa1de5a5e529c2242d"`,
    );
    await queryRunner.query(`DROP TABLE "configuracao_modulo"`);
    await queryRunner.query(
      `DROP TYPE "public"."configuracao_modulo_modulo_enum"`,
    );
    await queryRunner.query(`DROP TABLE "empresa"`);
  }
}
