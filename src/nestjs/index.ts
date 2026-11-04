// Decorator-free on purpose: no runtime import of @nestjs/* (optional peers) and no emitDecoratorMetadata needed.
import type { DynamicModule } from '@nestjs/common';
import { banks, findBank } from '../banks/catalog';
import { decodeImage } from '../decode/decoder';
import { createPayload } from '../emv/payload';
import { parse } from '../parse/parser';
import { render, renderDataUrl } from '../render';
import { VietQrDeeplinkClient, type DeeplinkOptions } from '../deeplink';

export { VietQrDeeplinkClient, type DeeplinkOptions };
export const VIETQR_DEEPLINK_OPTIONS = Symbol('VIETQR_DEEPLINK_OPTIONS');

/** Thin injectable facade over the main entry. */
export class VietQrService {
  readonly createPayload = createPayload;
  readonly parse = parse;
  readonly decodeImage = decodeImage;
  readonly render = render;
  readonly renderDataUrl = renderDataUrl;
  readonly findBank = findBank;
  get banks() { return banks; }
}

export interface VietQrModuleOptions { deeplink?: DeeplinkOptions; isGlobal?: boolean }

export class VietQrModule {
  static forRoot(opts: VietQrModuleOptions = {}): DynamicModule {
    return {
      module: VietQrModule,
      global: opts.isGlobal ?? false,
      providers: [
        { provide: VIETQR_DEEPLINK_OPTIONS, useValue: opts.deeplink ?? {} },
        { provide: VietQrService, useFactory: () => new VietQrService() },
        { provide: VietQrDeeplinkClient, useFactory: (o: DeeplinkOptions) => new VietQrDeeplinkClient(o), inject: [VIETQR_DEEPLINK_OPTIONS] },
      ],
      exports: [VIETQR_DEEPLINK_OPTIONS, VietQrService, VietQrDeeplinkClient],
    };
  }
}
