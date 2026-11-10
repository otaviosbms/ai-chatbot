import { MigrationInterface, QueryRunner } from 'typeorm';

export class TravasPorEtapa1793343000000 implements MigrationInterface {
  name = 'TravasPorEtapa1793343000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "conversa" ADD "travasPorEtapa" jsonb NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "conversa" DROP COLUMN "travasPorEtapa"`,
    );
  }
}
