import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service.js';
import { hashSenha } from '../senha.js';

const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres';
const EMPRESA = { id: 'e1', nome: 'Padaria' };

function montar(env: Record<string, string> = {}) {
  const usuarios = {
    exists: vi.fn(async () => false),
    findOne: vi.fn(),
    create: vi.fn((d: object) => d),
    save: vi.fn(async (d: object) => ({ id: 'u1', ...d })),
  };
  const empresas = { delete: vi.fn() };
  const configuracao = { criarEmpresa: vi.fn(async () => EMPRESA) };
  const config = {
    get: (chave: string) =>
      ({ JWT_SECRET: SEGREDO, REGISTRO_ABERTO: 'true', ...env })[chave],
  } as unknown as ConfigService;
  const service = new AuthService(
    usuarios as never,
    empresas as never,
    configuracao as never,
    config,
  );
  return { service, usuarios, empresas, configuracao };
}

describe('AuthService', () => {
  it('não sobe sem JWT_SECRET forte', () => {
    expect(() => montar({ JWT_SECRET: 'curto' })).toThrow(/JWT_SECRET/);
  });

  it('registra: cria empresa e conta e devolve token', async () => {
    const { service, usuarios } = montar();

    const sessao = await service.registrar({
      nomeEmpresa: 'Padaria',
      email: 'dono@x.com',
      senha: 'senha-longa-1',
    });

    expect(sessao.empresa).toEqual(EMPRESA);
    expect(service.verificar(sessao.token)).toMatchObject({ sub: 'u1', emp: 'e1' });
    const gravado = usuarios.save.mock.calls[0][0] as { senhaHash: string };
    expect(gravado.senhaHash).not.toContain('senha-longa-1');
  });

  it('deixa o cadastro aberto quando REGISTRO_ABERTO não está definida', () => {
    const { service } = montar({ REGISTRO_ABERTO: '' });

    expect(service.registroAberto()).toBe(true);
  });

  it('recusa registro com o cadastro fechado', async () => {
    const { service, configuracao } = montar({ REGISTRO_ABERTO: 'false' });

    await expect(
      service.registrar({ nomeEmpresa: 'X', email: 'a@x.com', senha: 'senha-longa-1' }),
    ).rejects.toMatchObject({ extensions: { code: 'REGISTRO_FECHADO' } });
    expect(configuracao.criarEmpresa).not.toHaveBeenCalled();
  });

  it('recusa e-mail já usado sem criar empresa', async () => {
    const { service, usuarios, configuracao } = montar();
    usuarios.exists.mockResolvedValue(true);

    await expect(
      service.registrar({ nomeEmpresa: 'X', email: 'a@x.com', senha: 'senha-longa-1' }),
    ).rejects.toMatchObject({ extensions: { code: 'EMAIL_EM_USO' } });
    expect(configuracao.criarEmpresa).not.toHaveBeenCalled();
  });

  it('apaga a empresa se a conta falhar ao gravar', async () => {
    const { service, usuarios, empresas } = montar();
    usuarios.save.mockRejectedValue(new Error('boom'));

    await expect(
      service.registrar({ nomeEmpresa: 'X', email: 'a@x.com', senha: 'senha-longa-1' }),
    ).rejects.toThrow('boom');
    expect(empresas.delete).toHaveBeenCalledWith({ id: 'e1' });
  });

  it('entra com a senha certa', async () => {
    const { service, usuarios } = montar();
    usuarios.findOne.mockResolvedValue({
      id: 'u1',
      empresaId: 'e1',
      email: 'a@x.com',
      senhaHash: await hashSenha('senha-longa-1'),
      empresa: EMPRESA,
    });

    const sessao = await service.entrar({ email: 'a@x.com', senha: 'senha-longa-1' });

    expect(service.verificar(sessao.token)).toMatchObject({ sub: 'u1', emp: 'e1' });
  });

  it('dá a mesma resposta para senha errada e e-mail inexistente', async () => {
    const { service, usuarios } = montar();
    usuarios.findOne.mockResolvedValueOnce({
      id: 'u1',
      empresaId: 'e1',
      senhaHash: await hashSenha('senha-longa-1'),
      empresa: EMPRESA,
    });
    const errada = await service
      .entrar({ email: 'a@x.com', senha: 'errada-errada' })
      .catch((e: Error) => e);
    usuarios.findOne.mockResolvedValueOnce(null);
    const inexistente = await service
      .entrar({ email: 'b@x.com', senha: 'errada-errada' })
      .catch((e: Error) => e);

    expect(errada).toMatchObject({ extensions: { code: 'CREDENCIAIS_INVALIDAS' } });
    expect((inexistente as Error).message).toBe((errada as Error).message);
  });

  it('bloqueia depois de muitas senhas erradas', async () => {
    const { service, usuarios } = montar();
    usuarios.findOne.mockResolvedValue(null);

    for (let i = 0; i < 8; i++) {
      await service.entrar({ email: 'a@x.com', senha: 'errada-errada' }).catch(() => undefined);
    }

    await expect(
      service.entrar({ email: 'a@x.com', senha: 'errada-errada' }),
    ).rejects.toMatchObject({ extensions: { code: 'TENTATIVAS_EXCEDIDAS' } });
  });
});
