/**
 * Trava o login depois de muitas senhas erradas para o mesmo e-mail.
 * Fica em memória: reiniciar a API zera, o que é aceitável para uma única instância.
 */
export class LimitadorTentativas {
  private readonly falhas = new Map<string, number[]>();

  constructor(
    private readonly maximo = 8,
    private readonly janelaMs = 15 * 60 * 1000,
    private readonly agora: () => number = Date.now,
  ) {}

  bloqueado(chave: string): boolean {
    return this.recentes(chave).length >= this.maximo;
  }

  registrarFalha(chave: string): void {
    const lista = this.recentes(chave);
    lista.push(this.agora());
    this.falhas.set(chave, lista);
  }

  limpar(chave: string): void {
    this.falhas.delete(chave);
  }

  private recentes(chave: string): number[] {
    const corte = this.agora() - this.janelaMs;
    const lista = (this.falhas.get(chave) ?? []).filter((t) => t > corte);
    if (lista.length === 0) {
      this.falhas.delete(chave);
    }
    return lista;
  }
}
