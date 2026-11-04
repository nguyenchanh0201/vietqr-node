import { createRequire } from 'node:module';
import * as main from 'vietqr-node';
import * as deeplink from 'vietqr-node/deeplink';
import scenario from './scenario.cjs';

await scenario.run('ESM', main, deeplink, createRequire(import.meta.url));
