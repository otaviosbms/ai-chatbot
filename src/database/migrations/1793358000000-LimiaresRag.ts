import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Limiares calibrados pela avaliação do RAG (scripts/avaliar-rag.mjs).
 * Só muda empresa que ainda está no padrão antigo (limiteRelevancia 0,1);
 * quem ajustou o valor em Configurações fica como está.
 */
export class LimiaresRag1793358000000 implements MigrationInterface {
  name = 'LimiaresRag1793358000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "configuracao_modulo"
         SET "config" = "config" || '{"limiteRelevancia": 0.3, "limiarSimilaridade": 0.42}'::jsonb
       WHERE "modulo" = 'BASE_CONHECIMENTO'
         AND ("config"->>'limiteRelevancia')::numeric = 0.1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "configuracao_modulo"
         SET "config" = ("config" - 'limiarSimilaridade') || '{"limiteRelevancia": 0.1}'::jsonb
       WHERE "modulo" = 'BASE_CONHECIMENTO'
         AND ("config"->>'limiteRelevancia')::numeric = 0.3
         AND ("config"->>'limiarSimilaridade')::numeric = 0.42`,
    );
  }
}
