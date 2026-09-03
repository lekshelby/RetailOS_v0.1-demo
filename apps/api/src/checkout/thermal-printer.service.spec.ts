import { ConfigService } from '@nestjs/config';
import { ThermalPrinterService } from './thermal-printer.service';

describe('ThermalPrinterService mocked transport regression', () => {
  it('creates one print job payload through the selected transport without contacting hardware', async () => {
    const service = new ThermalPrinterService({ get: jest.fn() } as unknown as ConfigService);
    const send = jest.spyOn(service as unknown as { send: (transport: string, body: Buffer, settings: object) => Promise<void> }, 'send').mockResolvedValue();
    const result = await service.print('LAN_ESC_POS', ['Committed receipt', 'Total RM20.00'], 80, { lanHost: '192.168.0.200', lanPort: 9100 });
    expect(result).toEqual({ jobId: expect.any(String), transport: 'LAN_ESC_POS' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('LAN_ESC_POS', expect.any(Buffer), expect.objectContaining({ lanHost: '192.168.0.200', lanPort: 9100 }));
  });
});
