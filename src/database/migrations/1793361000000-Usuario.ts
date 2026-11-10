import { MigrationInterface, QueryRunner } from 'typeorm';

export class Usuario1793361000000 implements MigrationInterface {
  name = 'Usuario1793361000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "usuario" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresaId" uuid NOT NULL,
        "email" character varying(254) NOT NULL,
        "senhaHash" text NOT NULL,
        "criadoEm" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_usuario" PRIMARY KEY ("id"),
        CONSTRAINT "FK_usuario_empresa" FOREIGN KEY ("empresaId")
          REFERENCES "empresa" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_usuario_email" ON "usuario" ("email")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_usuario_empresa" ON "usuario" ("empresaId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "usuario"`);
  }
}
