import { MigrationInterface, QueryRunner } from 'typeorm';

export class SemAtendente1793334000000 implements MigrationInterface {
  name = 'SemAtendente1793334000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "conversa" DROP CONSTRAINT "FK_conversa_atendente"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transferencia" DROP CONSTRAINT "FK_transferencia_atendente"`,
    );
    await queryRunner.query(`ALTER TABLE "conversa" DROP COLUMN "atendenteId"`);
    await queryRunner.query(
      `ALTER TABLE "transferencia" DROP COLUMN "atendenteId"`,
    );
    await queryRunner.query(`DROP TABLE "atendente"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
      `ALTER TABLE "atendente" ADD CONSTRAINT "FK_atendente_empresa" FOREIGN KEY ("empresaId") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`ALTER TABLE "conversa" ADD "atendenteId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "transferencia" ADD "atendenteId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "transferencia" ADD CONSTRAINT "FK_transferencia_atendente" FOREIGN KEY ("atendenteId") REFERENCES "atendente"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversa" ADD CONSTRAINT "FK_conversa_atendente" FOREIGN KEY ("atendenteId") REFERENCES "atendente"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }
}
