import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgenteEtapaSlot1793319500000 implements MigrationInterface {
  name = 'AgenteEtapaSlot1793319500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."slot_tipo_enum" AS ENUM('texto', 'email', 'numero')`,
    );
    await queryRunner.query(
      `CREATE TABLE "agente" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "empresaId" uuid NOT NULL,
         "nome" character varying NOT NULL,
         "criadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "atualizadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_agente" PRIMARY KEY ("id"),
         CONSTRAINT "UQ_agente_empresa_nome" UNIQUE ("empresaId", "nome")
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_agente_empresa" ON "agente" ("empresaId")`,
    );
    await queryRunner.query(
      `CREATE TABLE "etapa" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "empresaId" uuid NOT NULL,
         "agenteId" uuid NOT NULL,
         "nome" character varying NOT NULL,
         "mensagem" text NOT NULL,
         "ordem" integer NOT NULL,
         "ativa" boolean NOT NULL DEFAULT true,
         "criadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "atualizadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_etapa" PRIMARY KEY ("id"),
         CONSTRAINT "UQ_etapa_agente_ordem" UNIQUE ("agenteId", "ordem")
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_etapa_empresa" ON "etapa" ("empresaId")`,
    );
    await queryRunner.query(
      `CREATE TABLE "slot" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "empresaId" uuid NOT NULL,
         "agenteId" uuid NOT NULL,
         "etapaId" uuid NOT NULL,
         "nome" character varying NOT NULL,
         "tipo" "public"."slot_tipo_enum" NOT NULL,
         "obrigatorio" boolean NOT NULL,
         "criadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "atualizadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_slot" PRIMARY KEY ("id"),
         CONSTRAINT "UQ_slot_etapa" UNIQUE ("etapaId"),
         CONSTRAINT "UQ_slot_agente_nome" UNIQUE ("agenteId", "nome")
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_slot_empresa" ON "slot" ("empresaId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "agente" ADD CONSTRAINT "FK_agente_empresa" FOREIGN KEY ("empresaId") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "etapa" ADD CONSTRAINT "FK_etapa_empresa" FOREIGN KEY ("empresaId") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "etapa" ADD CONSTRAINT "FK_etapa_agente" FOREIGN KEY ("agenteId") REFERENCES "agente"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "slot" ADD CONSTRAINT "FK_slot_empresa" FOREIGN KEY ("empresaId") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "slot" ADD CONSTRAINT "FK_slot_agente" FOREIGN KEY ("agenteId") REFERENCES "agente"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "slot" ADD CONSTRAINT "FK_slot_etapa" FOREIGN KEY ("etapaId") REFERENCES "etapa"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`ALTER TABLE "conversa" ADD "etapaAtualId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "conversa" ADD "valoresSlot" jsonb NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversa" ADD CONSTRAINT "FK_conversa_etapa_atual" FOREIGN KEY ("etapaAtualId") REFERENCES "etapa"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_conversa_etapa_atual" ON "conversa" ("etapaAtualId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_conversa_etapa_atual"`);
    await queryRunner.query(
      `ALTER TABLE "conversa" DROP CONSTRAINT "FK_conversa_etapa_atual"`,
    );
    await queryRunner.query(`ALTER TABLE "conversa" DROP COLUMN "valoresSlot"`);
    await queryRunner.query(
      `ALTER TABLE "conversa" DROP COLUMN "etapaAtualId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "slot" DROP CONSTRAINT "FK_slot_etapa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "slot" DROP CONSTRAINT "FK_slot_agente"`,
    );
    await queryRunner.query(
      `ALTER TABLE "slot" DROP CONSTRAINT "FK_slot_empresa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "etapa" DROP CONSTRAINT "FK_etapa_agente"`,
    );
    await queryRunner.query(
      `ALTER TABLE "etapa" DROP CONSTRAINT "FK_etapa_empresa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agente" DROP CONSTRAINT "FK_agente_empresa"`,
    );
    await queryRunner.query(`DROP TABLE "slot"`);
    await queryRunner.query(`DROP TABLE "etapa"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_agente_empresa"`);
    await queryRunner.query(`DROP TABLE "agente"`);
    await queryRunner.query(`DROP TYPE "public"."slot_tipo_enum"`);
  }
}
