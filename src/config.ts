/* eslint-disable @typescript-eslint/no-non-null-assertion */
// config settings, env variables
import * as dotenv from 'dotenv';
import * as path from 'path';

import { type RedisConfig } from '@frmscoe/frms-coe-lib/lib/interfaces';

// Load .env file into process.env if it exists. This is convenient for running locally.
dotenv.config({
  path: path.resolve(__dirname, '../.env'),
});

export interface IConfig {
  maxCPU: number;
  env: string;
  functionName: string;
  apm: {
    secretToken: string;
    serviceName: string;
    url: string;
    active: string;
  };
  db: {
    name: string;
    password: string;
    url: string;
    user: string;
    collectionName: string;
    dbCertPath: string;
    cacheEnabled?: boolean;
    cacheTTL?: number;
  };
  cmsProducer: string;
  logger: {
    logstashHost: string;
    logstashPort: number;
    logstashLevel: string;
  };
  redis: RedisConfig;
  transactionRouting: {
    host: string;
    path: string;
    port: number;
  };
}

export const configuration: IConfig = {
  maxCPU: parseInt(process.env.MAX_CPU!, 10) || 1,
  apm: {
    serviceName: process.env.APM_SERVICE_NAME as string,
    url: process.env.APM_URL as string,
    secretToken: process.env.APM_SECRET_TOKEN as string,
    active: process.env.APM_ACTIVE as string,
  },
  cmsProducer: process.env.CMS_PRODUCER as string,
  db: {
    name: process.env.DATABASE_NAME as string,
    password: process.env.DATABASE_PASSWORD as string,
    url: process.env.DATABASE_URL as string,
    user: process.env.DATABASE_USER as string,
    collectionName: process.env.COLLECTION_NAME as string,
    dbCertPath: process.env.DATABASE_CERT_PATH as string,
    cacheEnabled: process.env.CACHE_ENABLED === 'true',
    cacheTTL: parseInt(process.env.CACHE_TTL!, 10),
  },
  env: process.env.NODE_ENV as string,
  functionName: process.env.FUNCTION_NAME as string,
  logger: {
    logstashHost: process.env.LOGSTASH_HOST as string,
    logstashPort: parseInt(process.env.LOGSTASH_PORT ?? '0', 10),
    logstashLevel: (process.env.LOGSTASH_LEVEL as string) || 'info',
  },
  redis: {
    db: parseInt(process.env.REDIS_DB!, 10) || 0,
    servers: JSON.parse((process.env.REDIS_SERVERS as string) || '[{"host": "127.0.0.1", "port":6379}]'),
    password: process.env.REDIS_AUTH as string,
    isCluster: process.env.REDIS_IS_CLUSTER === 'true',
  },
  transactionRouting: {
    host: process.env.TRANSACTION_ROUTING_HOST as string,
    path: process.env.TRANSACTION_ROUTING_PATH as string,
    port: parseInt(process.env.TRANSACTION_ROUTING_PORT!, 10),
  },
};
