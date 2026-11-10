import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConversaMensagem1793280914237 implements MigrationInterface {
  name = 'ConversaMensagem1793280914237';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."conversa_estado_enum" AS ENUM('BOT', 'AGUARDANDO_HUMANO', 'HUMANO', 'ENCERRADA')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."mensagem_autor_enum" AS ENUM('CLIENTE', 'BOT', 'ATENDENTE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "conversa" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "empresaId" uuid NOT NULL,
         "contatoId" character varying NOT NULL,
         "canal" character varying NOT NULL,
         "estado" "public"."conversa_estado_enum" NOT NULL DEFAULT 'BOT',
         "atendenteId" uuid,
         "ultimaMensagemEm" TIMESTAMP WITH TIME ZONE NOT NULL,
         "criadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "atualizadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_conversa" PRIMARY KEY ("id")
       )`,
    );
    await queryRunner.query(
      `CREATE TABLE "mensagem" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "conversaId" uuid NOT NULL,
         "autor" "public"."mensagem_autor_enum" NOT NULL,
         "texto" text NOT NULL,
         "metadados" jsonb NOT NULL DEFAULT '{}',
         "criadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "atualizadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_mensagem" PRIMARY KEY ("id")
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_conversa_empresa_estado" ON "conversa" ("empresaId", "estado")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_conversa_aberta" ON "conversa" ("empresaId", "contatoId", "canal") WHERE "estado" <> 'ENCERRADA'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_mensagem_conversa_criado" ON "mensagem" ("conversaId", "criadoEm")`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversa" ADD CONSTRAINT "FK_conversa_empresa" FOREIGN KEY ("empresaId") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "mensagem" ADD CONSTRAINT "FK_mensagem_conversa" FOREIGN KEY ("conversaId") REFERENCES "conversa"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mensagem" DROP CONSTRAINT "FK_mensagem_conversa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversa" DROP CONSTRAINT "FK_conversa_empresa"`,
    );
    await queryRunner.query(`DROP TABLE "mensagem"`);
    await queryRunner.query(`DROP TABLE "conversa"`);
    await queryRunner.query(`DROP TYPE "public"."mensagem_autor_enum"`);
    await queryRunner.query(`DROP TYPE "public"."conversa_estado_enum"`);
  }
}
