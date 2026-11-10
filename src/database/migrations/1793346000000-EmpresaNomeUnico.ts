import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmpresaNomeUnico1793346000000 implements MigrationInterface {
  name = 'EmpresaNomeUnico1793346000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Empresas já repetidas ficam com " (2)", " (3)"... a partir da segunda mais antiga,
    // para o índice único poder ser criado sem apagar dados.
    await queryRunner.query(`
      UPDATE "empresa" e
      SET "nome" = e."nome" || ' (' || d.posicao || ')'
      FROM (
        SELECT "id",
               ROW_NUMBER() OVER (
                 PARTITION BY lower(btrim("nome")) ORDER BY "criadoEm", "id"
               ) AS posicao
        FROM "empresa"
      ) d
      WHERE e."id" = d."id" AND d.posicao > 1
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_empresa_nome" ON "empresa" (lower(btrim("nome")))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_empresa_nome"`);
  }
}
