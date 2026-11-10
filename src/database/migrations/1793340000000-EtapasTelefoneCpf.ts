import { MigrationInterface, QueryRunner } from 'typeorm';

export class EtapasTelefoneCpf1793340000000 implements MigrationInterface {
  name = 'EtapasTelefoneCpf1793340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "etapa" WHERE "chave" = 'pergunta_negocio'`,
    );
    await queryRunner.query(`
      DO $$
      DECLARE
        agente_linha record;
        ordem_base integer;
      BEGIN
        FOR agente_linha IN SELECT "id", "empresaId" FROM "agente" LOOP
          SELECT "ordem" INTO ordem_base
          FROM "etapa"
          WHERE "agenteId" = agente_linha."id" AND "chave" = 'email';
          ordem_base := COALESCE(ordem_base, 0);

          UPDATE "etapa"
          SET "ordem" = -"ordem"
          WHERE "agenteId" = agente_linha."id" AND "ordem" > ordem_base;

          UPDATE "etapa"
          SET "ordem" = -"ordem" + 2
          WHERE "agenteId" = agente_linha."id" AND "ordem" < 0;

          INSERT INTO "etapa" (
            "id", "empresaId", "agenteId", "nome", "chave", "mensagem",
            "ordem", "ativa", "efeito", "criadoEm", "atualizadoEm"
          )
          SELECT gen_random_uuid(), agente_linha."empresaId", agente_linha."id",
            'Telefone', 'telefone'::"public"."chave_agente_enum",
            'Qual é o seu telefone?', ordem_base + 1, true, NULL, now(), now()
          WHERE NOT EXISTS (
            SELECT 1 FROM "etapa"
            WHERE "agenteId" = agente_linha."id" AND "chave" = 'telefone'
          );

          INSERT INTO "etapa" (
            "id", "empresaId", "agenteId", "nome", "chave", "mensagem",
            "ordem", "ativa", "efeito", "criadoEm", "atualizadoEm"
          )
          SELECT gen_random_uuid(), agente_linha."empresaId", agente_linha."id",
            'CPF', 'cpf'::"public"."chave_agente_enum",
            'Qual é o seu CPF?', ordem_base + 2, true, NULL, now(), now()
          WHERE NOT EXISTS (
            SELECT 1 FROM "etapa"
            WHERE "agenteId" = agente_linha."id" AND "chave" = 'cpf'
          );
        END LOOP;
      END $$;
    `);
    await queryRunner.query(`
      INSERT INTO "slot" (
        "id", "empresaId", "agenteId", "etapaId", "nome", "tipo",
        "obrigatorio", "criadoEm", "atualizadoEm"
      )
      SELECT gen_random_uuid(), etapa."empresaId", etapa."agenteId", etapa."id",
        etapa."chave"::text, etapa."chave"::text::"public"."slot_tipo_enum",
        true, now(), now()
      FROM "etapa" etapa
      WHERE etapa."chave" IN ('telefone', 'cpf')
        AND NOT EXISTS (
          SELECT 1 FROM "slot" slot WHERE slot."etapaId" = etapa."id"
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "etapa" WHERE "chave" IN ('telefone', 'cpf')`,
    );
    await queryRunner.query(`
      INSERT INTO "etapa" (
        "id", "empresaId", "agenteId", "nome", "chave", "mensagem",
        "ordem", "ativa", "efeito", "criadoEm", "atualizadoEm"
      )
      SELECT gen_random_uuid(), agente."empresaId", agente."id",
        'Pergunta de negócio', 'pergunta_negocio'::"public"."chave_agente_enum",
        'Pode perguntar sobre a empresa.',
        COALESCE((
          SELECT MAX(etapa."ordem") + 1 FROM "etapa" etapa
          WHERE etapa."agenteId" = agente."id"
        ), 0),
        true, NULL, now(), now()
      FROM "agente" agente
      WHERE NOT EXISTS (
        SELECT 1 FROM "etapa" etapa
        WHERE etapa."agenteId" = agente."id"
          AND etapa."chave" = 'pergunta_negocio'
      )
    `);
  }
}
