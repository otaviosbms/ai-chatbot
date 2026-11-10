import { MigrationInterface, QueryRunner } from 'typeorm';

export class SaudacaoConfiguravel1793331000000 implements MigrationInterface {
  name = 'SaudacaoConfiguravel1793331000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "conversa" ADD "saudacaoDita" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `UPDATE "conversa" conversa
       SET "saudacaoDita" = true
       WHERE EXISTS (
         SELECT 1 FROM "etapa" etapa
         WHERE etapa."chave" = 'saudacao'
           AND conversa."etapasCumpridas" @> to_jsonb(etapa."id"::text)
       )`,
    );
    await queryRunner.query(
      `UPDATE "configuracao_modulo" config
       SET "config" = jsonb_set(
         config."config",
         '{persona,saudacao}',
         to_jsonb(etapa."mensagem"),
         true
       )
       FROM "etapa" etapa
       WHERE etapa."chave" = 'saudacao'
         AND etapa."empresaId" = config."empresaId"
         AND config."modulo" = 'ATENDIMENTO_GERAL'`,
    );
    await queryRunner.query(
      `UPDATE "conversa" conversa
       SET "etapasCumpridas" = COALESCE((
         SELECT jsonb_agg(item)
         FROM jsonb_array_elements(conversa."etapasCumpridas") item
         WHERE item #>> '{}' NOT IN (
           SELECT etapa."id"::text FROM "etapa" etapa WHERE etapa."chave" = 'saudacao'
         )
       ), '[]'::jsonb)`,
    );
    await queryRunner.query(
      `DELETE FROM "etapa" WHERE "chave" = 'saudacao'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "conversa" DROP COLUMN "saudacaoDita"`,
    );
  }
}
