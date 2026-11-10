import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'protocolo_contador' })
export class ProtocoloContador {
  @PrimaryColumn({ type: 'uuid' })
  empresaId: string;

  @Column()
  ano: number;

  @Column()
  valor: number;
}
