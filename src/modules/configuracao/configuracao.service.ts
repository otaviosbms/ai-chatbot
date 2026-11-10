import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GraphQLError } from 'graphql';
import { DataSource, QueryFailedError, Raw, Repository } from 'typeorm';
import { coletarPlaceholdersDesconhecidos } from '../../common/template.js';
import { logPadrao, LogService } from '../log/log.service.js';
import { semearCatalogo } from '../agente/catalogo/semear.js';
import { configPadrao } from './config.defaults.js';
import { descreverErros, schemaPorModulo } from './schemas/config.schema.js';
import { ConfiguracaoModulo } from './entities/configuracao-modulo.entity.js';
import { Empresa } from './entities/empresa.entity.js';
import {
  MODULOS_OBRIGATORIOS,
  ModuloTipo,
  ORDEM_MODULOS,
} from './enums/modulo-tipo.enum.js';
import { SalvarConfiguracaoInput } from './inputs/salvar-configuracao.input.js';

@Injectable()
export class ConfiguracaoService {
  private readonly log: LogService;

  constructor(
    @InjectRepository(Empresa)
    private readonly empresas: Repository<Empresa>,
    @InjectRepository(ConfiguracaoModulo)
    private readonly configs: Repository<ConfiguracaoModulo>,
    private readonly dataSource: DataSource,
    @Optional() log?: LogService,
  ) {
    this.log = logPadrao(log);
  }

  async criarEmpresa(nome: string): Promise<Empresa> {
    const nomeLimpo = nome.trim();
    const existente = await this.empresas.findOne({
      where: {
        nome: Raw((campo) => `lower(btrim(${campo})) = :nome`, {
          nome: nomeLimpo.toLowerCase(),
        }),
      },
    });
    if (existente) {
      throw empresaDuplicada(nomeLimpo);
    }
    const empresa = await this.dataSource
      .transaction(async (manager) => {
        const empresa = await manager.save(
          manager.create(Empresa, { nome: nomeLimpo, ativa: true }),
        );
        const linhas = ORDEM_MODULOS.map((modulo) =>
          manager.create(ConfiguracaoModulo, {
            empresaId: empresa.id,
            modulo,
            ativo: true,
            config: configPadrao(modulo, empresa.nome),
          }),
        );
        await manager.save(linhas);
        await semearCatalogo(manager, empresa.id);
        return empresa;
      })
      .catch((erro: unknown) => {
        // Duas criações simultâneas com o mesmo nome: o índice único barra a segunda.
        if (
          erro instanceof QueryFailedError &&
          (erro.driverError as { code?: string } | undefined)?.code === '23505'
        ) {
          throw empresaDuplicada(nomeLimpo);
        }
        throw erro;
      });
    this.log.info('configuracao', 'empresa.criada', {
      empresaId: empresa.id,
      campos: { modulos: ORDEM_MODULOS.length },
    });
    return empresa;
  }

  async listar(empresaId: string): Promise<ConfiguracaoModulo[]> {
    await this.exigirEmpresa(empresaId);
    const linhas = await this.configs.find({ where: { empresaId } });
    return linhas.sort(
      (a, b) =>
        ORDEM_MODULOS.indexOf(a.modulo) - ORDEM_MODULOS.indexOf(b.modulo),
    );
  }

  async salvar(
    empresaId: string,
    modulo: ModuloTipo,
    ativo: boolean,
    config: Record<string, unknown>,
  ): Promise<ConfiguracaoModulo> {
    await this.validarEntrada({ empresaId, modulo, ativo, config });
    if (!ativo && MODULOS_OBRIGATORIOS.includes(modulo)) {
      this.log.warn('configuracao', 'modulo.obrigatorio', {
        empresaId,
        codigo: 'MODULO_OBRIGATORIO',
        campos: { modulo },
      });
      throw erroDominio(
        'Módulo obrigatório não pode ser desativado.',
        'MODULO_OBRIGATORIO',
      );
    }
    await this.validarConfig(modulo, config);

    const linha = await this.configs.findOne({ where: { empresaId, modulo } });
    if (!linha) {
      await this.exigirEmpresa(empresaId);
      throw erroDominio(
        'Configuração do módulo não encontrada.',
        'CONFIG_INVALIDA',
      );
    }

    linha.ativo = ativo;
    linha.config = config;
    const salva = await this.configs.save(linha);
    this.log.info('configuracao', 'modulo.salvo', {
      empresaId,
      campos: { modulo, ativo },
    });
    return salva;
  }

  private async validarEntrada(dados: SalvarConfiguracaoInput): Promise<void> {
    const input = plainToInstance(SalvarConfiguracaoInput, dados);
    const errors = await validate(input);
    if (errors.length > 0) {
      throw erroDominio(descreverErros(errors), 'CONFIG_INVALIDA');
    }
  }

  private async validarConfig(
    modulo: ModuloTipo,
    config: Record<string, unknown>,
  ): Promise<void> {
    const desconhecidos = coletarPlaceholdersDesconhecidos(config);
    if (desconhecidos.length > 0) {
      throw erroDominio(
        `Placeholder desconhecido: ${desconhecidos.join(', ')}`,
        'CONFIG_INVALIDA',
      );
    }

    const schema = schemaPorModulo[modulo];
    const instance = plainToInstance(schema as new () => object, config);
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      throw erroDominio(descreverErros(errors), 'CONFIG_INVALIDA');
    }
  }

  private async exigirEmpresa(empresaId: string): Promise<Empresa> {
    const empresa = await this.empresas.findOne({ where: { id: empresaId } });
    if (!empresa) {
      throw erroDominio('Empresa não encontrada.', 'EMPRESA_NAO_ENCONTRADA');
    }
    return empresa;
  }
}

function empresaDuplicada(nome: string): GraphQLError {
  return erroDominio(
    `Já existe uma empresa chamada "${nome}".`,
    'EMPRESA_DUPLICADA',
  );
}

function erroDominio(message: string, code: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code } });
}
