import { MigrationInterface, QueryRunner } from 'typeorm';

export class Protocolo1793282104458 implements MigrationInterface {
  name = 'Protocolo1793282104458';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."protocolo_tipo_enum" AS ENUM('RECLAMACAO', 'DUVIDA', 'SOLICITACAO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."protocolo_status_enum" AS ENUM('ABERTO', 'EM_ANDAMENTO', 'RESOLVIDO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "protocolo_contador" (
         "empresaId" uuid NOT NULL,
         "ano" integer NOT NULL,
         "valor" integer NOT NULL,
         CONSTRAINT "PK_protocolo_contador" PRIMARY KEY ("empresaId")
       )`,
    );
    await queryRunner.query(
      `CREATE TABLE "protocolo" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "empresaId" uuid NOT NULL,
         "conversaId" uuid NOT NULL,
         "numero" character varying NOT NULL,
         "tipo" "public"."protocolo_tipo_enum" NOT NULL,
         "descricao" text NOT NULL,
         "status" "public"."protocolo_status_enum" NOT NULL,
         "encaminhadoParaHumano" boolean NOT NULL DEFAULT false,
         "criadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "atualizadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_protocolo" PRIMARY KEY ("id")
       )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_protocolo_empresa_numero" ON "protocolo" ("empresaId", "numero")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_protocolo_conversa" ON "protocolo" ("conversaId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "protocolo_contador" ADD CONSTRAINT "FK_protocolo_contador_empresa" FOREIGN KEY ("empresaId") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "protocolo" ADD CONSTRAINT "FK_protocolo_empresa" FOREIGN KEY ("empresaId") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "protocolo" ADD CONSTRAINT "FK_protocolo_conversa" FOREIGN KEY ("conversaId") REFERENCES "conversa"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "protocolo" DROP CONSTRAINT "FK_protocolo_conversa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "protocolo" DROP CONSTRAINT "FK_protocolo_empresa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "protocolo_contador" DROP CONSTRAINT "FK_protocolo_contador_empresa"`,
    );
    await queryRunner.query(`DROP TABLE "protocolo"`);
    await queryRunner.query(`DROP TABLE "protocolo_contador"`);
    await queryRunner.query(`DROP TYPE "public"."protocolo_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."protocolo_tipo_enum"`);
  }
}
