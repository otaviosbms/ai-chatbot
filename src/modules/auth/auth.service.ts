import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { GraphQLError } from 'graphql';
import { QueryFailedError, Repository } from 'typeorm';
import { ConfiguracaoService } from '../configuracao/configuracao.service.js';
import { Empresa } from '../configuracao/entities/empresa.entity.js';
import { logPadrao, LogService } from '../log/log.service.js';
import { Usuario } from './entities/usuario.entity.js';
import { EntrarInput } from './inputs/entrar.input.js';
import { RegistrarInput } from './inputs/registrar.input.js';
import { LimitadorTentativas } from './limitador-tentativas.js';
import { conferirSenha, conferirSenhaFalsa, hashSenha } from './senha.js';
import {
  assinarToken,
  SEGREDO_MIN,
  verificarToken,
  type PayloadToken,
} from './token.js';
import type { Sessao } from './types/sessao.type.js';

@Injectable()
export class AuthService {
  private readonly log: LogService;
  private readonly segredo: string;
  private readonly limitador = new LimitadorTentativas();

  constructor(
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
    @InjectRepository(Empresa)
    private readonly empresas: Repository<Empresa>,
    private readonly configuracao: ConfiguracaoService,
    private readonly config: ConfigService,
    @Optional() log?: LogService,
  ) {
    this.log = logPadrao(log);
    const segredo = this.config.get<string>('JWT_SECRET') ?? '';
    if (segredo.length < SEGREDO_MIN) {
      throw new Error(
        `Defina JWT_SECRET com pelo menos ${SEGREDO_MIN} caracteres no .env da API (ex.: openssl rand -hex 32).`,
      );
    }
    this.segredo = segredo;
  }

  /** Aberto por padrão; só `REGISTRO_ABERTO=false` fecha o cadastro. */
  registroAberto(): boolean {
    return this.config.get<string>('REGISTRO_ABERTO')?.trim().toLowerCase() !== 'false';
  }

  /** Cria a empresa (com agente e configurações padrão) e a conta dona dela. */
  async registrar(input: RegistrarInput): Promise<Sessao> {
    if (!this.registroAberto()) {
      throw erroAuth(
        'O cadastro de novas contas está fechado neste servidor.',
        'REGISTRO_FECHADO',
      );
    }
    if (await this.usuarios.exists({ where: { email: input.email } })) {
      throw emailEmUso();
    }
    const senhaHash = await hashSenha(input.senha);
    const empresa = await this.configuracao.criarEmpresa(input.nomeEmpresa);
    try {
      const usuario = await this.usuarios.save(
        this.usuarios.create({
          empresaId: empresa.id,
          email: input.email,
          senhaHash,
        }),
      );
      this.log.info('auth', 'conta.criada', { empresaId: empresa.id });
      return this.sessao(usuario, empresa);
    } catch (erro) {
      // Sem conta, a empresa recém-criada ficaria órfã.
      await this.empresas.delete({ id: empresa.id });
      if (violouUnico(erro)) {
        throw emailEmUso();
      }
      throw erro;
    }
  }

  async entrar(input: EntrarInput): Promise<Sessao> {
    if (this.limitador.bloqueado(input.email)) {
      this.log.warn('auth', 'login.bloqueado');
      throw erroAuth(
        'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
        'TENTATIVAS_EXCEDIDAS',
      );
    }
    const usuario = await this.usuarios.findOne({
      where: { email: input.email },
      relations: { empresa: true },
    });
    const confere = usuario
      ? await conferirSenha(input.senha, usuario.senhaHash)
      : await conferirSenhaFalsa(input.senha).then(() => false);
    if (!usuario || !confere) {
      this.limitador.registrarFalha(input.email);
      throw erroAuth('E-mail ou senha incorretos.', 'CREDENCIAIS_INVALIDAS');
    }
    this.limitador.limpar(input.email);
    this.log.info('auth', 'login.ok', { empresaId: usuario.empresaId });
    return this.sessao(usuario, usuario.empresa);
  }

  /** Confere um token do cabeçalho. Null se for inválido ou tiver expirado. */
  verificar(token: string): PayloadToken | null {
    return verificarToken(token, this.segredo);
  }

  /** Dados atuais da conta do token, com um token novo (renova a validade). */
  async sessaoAtual(usuarioId: string): Promise<Sessao> {
    const usuario = await this.usuarios.findOne({
      where: { id: usuarioId },
      relations: { empresa: true },
    });
    if (!usuario) {
      throw erroAuth('Sessão inválida. Entre de novo.', 'NAO_AUTENTICADO');
    }
    return this.sessao(usuario, usuario.empresa);
  }

  private sessao(usuario: Usuario, empresa: Empresa): Sessao {
    return {
      token: assinarToken({ sub: usuario.id, emp: usuario.empresaId }, this.segredo),
      usuario,
      empresa,
    };
  }
}

export function erroAuth(message: string, code: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code } });
}

function emailEmUso(): GraphQLError {
  return erroAuth('Já existe uma conta com esse e-mail.', 'EMAIL_EM_USO');
}

function violouUnico(erro: unknown): boolean {
  return (
    erro instanceof QueryFailedError &&
    (erro.driverError as { code?: string } | undefined)?.code === '23505'
  );
}
