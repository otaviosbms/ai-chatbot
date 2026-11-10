import { MigrationInterface, QueryRunner } from 'typeorm';

export class TelefoneCpf1793337000000 implements MigrationInterface {
  name = 'TelefoneCpf1793337000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."chave_agente_enum" ADD VALUE IF NOT EXISTS 'telefone'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."chave_agente_enum" ADD VALUE IF NOT EXISTS 'cpf'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."slot_tipo_enum" ADD VALUE IF NOT EXISTS 'telefone'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."slot_tipo_enum" ADD VALUE IF NOT EXISTS 'cpf'`,
    );
  }

  public async down(): Promise<void> {
    return Promise.resolve();
  }
}
