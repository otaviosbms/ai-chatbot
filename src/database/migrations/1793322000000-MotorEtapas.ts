import { MigrationInterface, QueryRunner } from 'typeorm';

export class MotorEtapas1793322000000 implements MigrationInterface {
  name = 'MotorEtapas1793322000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."efeito_etapa_enum" AS ENUM('handoff', 'protocolo')`,
    );
    await queryRunner.query(
      `ALTER TABLE "etapa" ADD "efeito" "public"."efeito_etapa_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "conversa" ADD "agenteId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "conversa" ADD "etapasCumpridas" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversa" ADD CONSTRAINT "FK_conversa_agente" FOREIGN KEY ("agenteId") REFERENCES "agente"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "conversa" DROP CONSTRAINT "FK_conversa_agente"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversa" DROP COLUMN "etapasCumpridas"`,
    );
    await queryRunner.query(`ALTER TABLE "conversa" DROP COLUMN "agenteId"`);
    await queryRunner.query(`ALTER TABLE "etapa" DROP COLUMN "efeito"`);
    await queryRunner.query(`DROP TYPE "public"."efeito_etapa_enum"`);
  }
}
