import { MigrationInterface, QueryRunner } from 'typeorm';

const CHAVES = [
  {
    chave: 'nome',
    nome: 'Nome',
    mensagem: 'Qual é o seu nome?',
    ordem: 0,
    efeito: 'NULL',
  },
  {
    chave: 'email',
    nome: 'E-mail',
    mensagem: 'Qual é o seu e-mail?',
    ordem: 1,
    efeito: 'NULL',
  },
  {
    chave: 'pergunta_negocio',
    nome: 'Pergunta de negócio',
    mensagem: 'Pode perguntar sobre a empresa.',
    ordem: 2,
    efeito: 'NULL',
  },
  {
    chave: 'protocolo',
    nome: 'Protocolo',
    mensagem: 'Protocolo {{numero}}.',
    ordem: 3,
    efeito: `'protocolo'`,
  },
  {
    chave: 'handoff',
    nome: 'Humano',
    mensagem: 'Vou chamar um atendente.',
    ordem: 4,
    efeito: `'handoff'`,
  },
] as const;

export class CatalogoAgentes1793328000000 implements MigrationInterface {
  name = 'CatalogoAgentes1793328000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."chave_agente_enum" AS ENUM('saudacao', 'nome', 'email', 'pergunta_negocio', 'protocolo', 'handoff')`,
    );
    await queryRunner.query(
      `ALTER TABLE "etapa" ADD "chave" "public"."chave_agente_enum"`,
    );
    await queryRunner.query(
      `UPDATE "etapa" SET "chave" = "nome"::"public"."chave_agente_enum" WHERE "nome" IN ('saudacao', 'nome', 'email', 'pergunta_negocio', 'protocolo', 'handoff')`,
    );
    await queryRunner.query(
      `UPDATE "etapa" SET "ativa" = false, "ordem" = "ordem" + 1000 WHERE "chave" IS NULL`,
    );
    await queryRunner.query(
      `INSERT INTO "agente" ("id", "empresaId", "nome", "criadoEm", "atualizadoEm")
       SELECT gen_random_uuid(), empresa."id", 'Atendimento', now(), now()
       FROM "empresa" empresa
       WHERE NOT EXISTS (
         SELECT 1 FROM "agente" agente WHERE agente."empresaId" = empresa."id"
       )`,
    );
    for (const item of CHAVES) {
      await queryRunner.query(
        `INSERT INTO "etapa" (
           "id", "empresaId", "agenteId", "nome", "chave", "mensagem", "ordem", "ativa", "efeito", "criadoEm", "atualizadoEm"
         )
         SELECT gen_random_uuid(), agente."empresaId", agente."id", '${item.nome}',
           '${item.chave}'::"public"."chave_agente_enum",
           '${item.mensagem}', ${item.ordem}, true, ${item.efeito === 'NULL' ? 'NULL' : `${item.efeito}::"public"."efeito_etapa_enum"`}, now(), now()
         FROM "agente" agente
         WHERE NOT EXISTS (
           SELECT 1 FROM "etapa" etapa
           WHERE etapa."agenteId" = agente."id" AND etapa."chave" = '${item.chave}'
         )`,
      );
    }
    await queryRunner.query(
      `INSERT INTO "slot" (
         "id", "empresaId", "agenteId", "etapaId", "nome", "tipo", "obrigatorio", "criadoEm", "atualizadoEm"
       )
       SELECT gen_random_uuid(), etapa."empresaId", etapa."agenteId", etapa."id",
         'nome', 'texto'::"public"."slot_tipo_enum", true, now(), now()
       FROM "etapa" etapa
       WHERE etapa."chave" = 'nome'
         AND NOT EXISTS (SELECT 1 FROM "slot" slot WHERE slot."etapaId" = etapa."id")`,
    );
    await queryRunner.query(
      `INSERT INTO "slot" (
         "id", "empresaId", "agenteId", "etapaId", "nome", "tipo", "obrigatorio", "criadoEm", "atualizadoEm"
       )
       SELECT gen_random_uuid(), etapa."empresaId", etapa."agenteId", etapa."id",
         'email', 'email'::"public"."slot_tipo_enum", true, now(), now()
       FROM "etapa" etapa
       WHERE etapa."chave" = 'email'
         AND NOT EXISTS (SELECT 1 FROM "slot" slot WHERE slot."etapaId" = etapa."id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_etapa_agente_chave" ON "etapa" ("agenteId", "chave") WHERE "chave" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_etapa_agente_chave"`);
    await queryRunner.query(`ALTER TABLE "etapa" DROP COLUMN "chave"`);
    await queryRunner.query(`DROP TYPE "public"."chave_agente_enum"`);
  }
}
