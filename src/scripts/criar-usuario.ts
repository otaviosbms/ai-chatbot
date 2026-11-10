/**
 * Cria (ou redefine a senha de) uma conta ligada a uma empresa que já existe.
 *
 *   node dist/scripts/criar-usuario.js --empresas
 *   node dist/scripts/criar-usuario.js <email> <empresaId>
 *
 * A senha é pedida no terminal (sem eco) ou lida de SENHA_USUARIO. Nunca vai na linha de comando.
 * No Docker: docker exec -it ai-chatbot-api node dist/scripts/criar-usuario.js <email> <empresaId>
 */
import 'dotenv/config';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../database/data-source-options.js';
import { conexaoDoAmbiente } from '../database/typeorm-options.js';
import { Usuario } from '../modules/auth/entities/usuario.entity.js';
import { hashSenha, SENHA_MAX, SENHA_MIN } from '../modules/auth/senha.js';
import { Empresa } from '../modules/configuracao/entities/empresa.entity.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function perguntarSemEco(pergunta: string): Promise<string> {
  return new Promise((resolve) => {
    let mudo = false;
    const saida = new Writable({
      write(chunk, _enc, cb) {
        if (!mudo) process.stdout.write(chunk);
        cb();
      },
    });
    const rl = createInterface({ input: process.stdin, output: saida, terminal: true });
    rl.question(pergunta, (resposta) => {
      rl.close();
      process.stdout.write('\n');
      resolve(resposta);
    });
    mudo = true;
  });
}

async function lerSenha(): Promise<string> {
  const doAmbiente = process.env.SENHA_USUARIO;
  if (doAmbiente) return doAmbiente;
  if (!process.stdin.isTTY) {
    throw new Error('Sem terminal: defina SENHA_USUARIO ou rode com docker exec -it.');
  }
  process.stdout.write('Senha: ');
  const senha = await perguntarSemEco('');
  process.stdout.write('Repita a senha: ');
  const repetida = await perguntarSemEco('');
  if (senha !== repetida) throw new Error('As senhas não conferem.');
  return senha;
}

async function main(): Promise<void> {
  const [primeiro, empresaId] = process.argv.slice(2);
  const dataSource = new DataSource(dataSourceOptions(conexaoDoAmbiente(process.env)));
  await dataSource.initialize();
  try {
    if (primeiro === '--empresas') {
      const linhas = await dataSource.getRepository(Empresa).find({ order: { criadoEm: 'ASC' } });
      for (const e of linhas) console.log(`${e.id}  ${e.nome}`);
      return;
    }
    const email = primeiro?.trim().toLowerCase();
    if (!email || !EMAIL.test(email) || !empresaId || !UUID.test(empresaId)) {
      throw new Error('Uso: criar-usuario.js <email> <empresaId>  (ou --empresas para listar)');
    }
    const empresa = await dataSource.getRepository(Empresa).findOneBy({ id: empresaId });
    if (!empresa) throw new Error('Empresa não encontrada. Rode com --empresas para ver os ids.');
    const senha = await lerSenha();
    if (senha.length < SENHA_MIN || senha.length > SENHA_MAX) {
      throw new Error(`A senha precisa ter de ${SENHA_MIN} a ${SENHA_MAX} caracteres.`);
    }
    const repo = dataSource.getRepository(Usuario);
    const existente = await repo.findOneBy({ email });
    if (existente && existente.empresaId !== empresaId) {
      throw new Error('Esse e-mail já pertence a outra empresa.');
    }
    const senhaHash = await hashSenha(senha);
    if (existente) {
      await repo.update({ id: existente.id }, { senhaHash });
      console.log(`Senha de ${email} redefinida (${empresa.nome}).`);
    } else {
      await repo.save(repo.create({ email, empresaId, senhaHash }));
      console.log(`Conta ${email} criada para "${empresa.nome}".`);
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
