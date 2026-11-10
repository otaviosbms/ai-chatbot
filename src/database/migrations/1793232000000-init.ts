import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1793232000000 implements MigrationInterface {
  name = 'Init1793232000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS unaccent');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP EXTENSION IF EXISTS unaccent');
  }
}
