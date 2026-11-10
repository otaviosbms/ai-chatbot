import { MigrationInterface, QueryRunner } from 'typeorm';

export class Transferencia1793281539128 implements MigrationInterface {
  name = 'Transferencia1793281539128';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."transferencia_motivo_enum" AS ENUM('PEDIDO_CLIENTE', 'PALAVRA_GATILHO', 'CASO_SAC', 'BAIXA_CONFIANCA', 'FALHAS_REPETIDAS')`,
    );
    await queryRunner.query(
      `CREATE TABLE "atendente" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "empresaId" uuid NOT NULL,
         "nome" character varying NOT NULL,
         "email" character varying NOT NULL,
         "ativo" boolean NOT NULL DEFAULT true,
         "criadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "atualizadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_atendente" PRIMARY KEY ("id")
       )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_atendente_empresa_email" ON "atendente" ("empresaId", "email")`,
    );
    await queryRunner.query(
      `CREATE TABLE "transferencia" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "conversaId" uuid NOT NULL,
         "motivo" "public"."transferencia_motivo_enum" NOT NULL,
         "solicitadaEm" TIMESTAMP WITH TIME ZONE NOT NULL,
         "assumidaEm" TIMESTAMP WITH TIME ZONE,
         "finalizadaEm" TIMESTAMP WITH TIME ZONE,
         "atendenteId" uuid,
         "criadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "atualizadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_transferencia" PRIMARY KEY ("id")
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transferencia_conversa" ON "transferencia" ("conversaId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_transferencia_aberta" ON "transferencia" ("conversaId") WHERE "finalizadaEm" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "atendente" ADD CONSTRAINT "FK_atendente_empresa" FOREIGN KEY ("empresaId") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transferencia" ADD CONSTRAINT "FK_transferencia_conversa" FOREIGN KEY ("conversaId") REFERENCES "conversa"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transferencia" ADD CONSTRAINT "FK_transferencia_atendente" FOREIGN KEY ("atendenteId") REFERENCES "atendente"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversa" ADD CONSTRAINT "FK_conversa_atendente" FOREIGN KEY ("atendenteId") REFERENCES "atendente"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "conversa" DROP CONSTRAINT "FK_conversa_atendente"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transferencia" DROP CONSTRAINT "FK_transferencia_atendente"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transferencia" DROP CONSTRAINT "FK_transferencia_conversa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "atendente" DROP CONSTRAINT "FK_atendente_empresa"`,
    );
    await queryRunner.query(`DROP TABLE "transferencia"`);
    await queryRunner.query(`DROP TABLE "atendente"`);
    await queryRunner.query(`DROP TYPE "public"."transferencia_motivo_enum"`);
  }
}
