import { HealthService } from './health.service.js';

describe('HealthService', () => {
  it('responde ok quando o banco executa SELECT 1', async () => {
    const query = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    const service = new HealthService({ query } as never);

    const status = await service.check();

    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(status.status).toBe('ok');
    expect(status.database).toBe('up');
    expect(status.checkedAt).toBeInstanceOf(Date);
  });

  it('propaga falha de conexão', async () => {
    const query = vi.fn().mockRejectedValue(new Error('connection refused'));
    const service = new HealthService({ query } as never);

    await expect(service.check()).rejects.toThrow('connection refused');
  });
});
