import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { VIETQR_DEEPLINK_OPTIONS, VietQrDeeplinkClient, VietQrModule, VietQrService } from '../src/nestjs';

describe('VietQrModule', () => {
  it('boots and provides VietQrService and the deeplink client', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [VietQrModule.forRoot({ deeplink: { baseUrl: 'https://x.test' } })],
    }).compile();
    const service = moduleRef.get(VietQrService);
    const payload = service.createPayload({ bankBin: '970422', accountNo: '0123456789', amount: 1000, description: 'x' });
    expect(service.parse(payload).accountNo).toBe('0123456789');
    expect(service.findBank('970422')?.shortName).toBe('MBBank');
    expect(service.banks.length).toBe(76);
    expect(moduleRef.get(VietQrDeeplinkClient).isConfigured).toBe(true);
    expect(moduleRef.get(VIETQR_DEEPLINK_OPTIONS)).toEqual({ baseUrl: 'https://x.test' });
  });

  it('defaults without options and supports isGlobal', () => {
    expect(VietQrModule.forRoot()).toMatchObject({ module: VietQrModule, global: false });
    expect(VietQrModule.forRoot({ isGlobal: true }).global).toBe(true);
  });
});
