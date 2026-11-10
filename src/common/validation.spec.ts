import { IsString } from 'class-validator';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { validationPipeOptions } from './validation.js';

class SampleInput {
  @IsString()
  nome: string;
}

describe('ValidationPipe', () => {
  const pipe = new ValidationPipe(validationPipeOptions);

  it('aceita um input válido e descarta a instância transformada', async () => {
    const result = await pipe.transform(
      { nome: 'Maria' },
      { type: 'body', metatype: SampleInput },
    );

    expect(result).toBeInstanceOf(SampleInput);
    expect(result).toMatchObject({ nome: 'Maria' });
  });

  it('rejeita propriedade desconhecida e tipo inválido', async () => {
    await expect(
      pipe.transform(
        { nome: 1, extra: true },
        { type: 'body', metatype: SampleInput },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
