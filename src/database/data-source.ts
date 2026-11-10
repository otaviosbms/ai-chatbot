import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from './data-source-options.js';
import { conexaoDoAmbiente } from './typeorm-options.js';

loadEnv();

// A variável do ambiente (Docker) vence o .env: o dotenv não sobrescreve o que já existe.
const dataSource = new DataSource(
  dataSourceOptions(conexaoDoAmbiente(process.env)),
);

export default dataSource;
