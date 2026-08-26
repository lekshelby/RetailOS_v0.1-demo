import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

export type PrinterTransport = 'LAN_ESC_POS' | 'WINDOWS_RAW' | 'SERIAL_ESC_POS';

const execFileAsync = promisify(execFile);

/** The RetailOS API is the print hub; phone clients never touch a printer. */
@Injectable()
export class ThermalPrinterService {
  private readonly host?: string;
  private readonly port: number;
  private readonly serialPort?: string;
  private readonly serialBaudRate: number;
  private readonly windowsPrinter?: string;
  private readonly includeLogo: boolean;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(config: ConfigService) {
    this.host = config.get<string>('RETAILOS_THERMAL_PRINTER_HOST')?.trim() || undefined;
    this.port = this.portNumber(config.get<string>('RETAILOS_THERMAL_PRINTER_PORT'), 9100);
    this.serialPort = config.get<string>('RETAILOS_THERMAL_PRINTER_SERIAL_PORT')?.trim() || undefined;
    this.serialBaudRate = this.baudRate(config.get<string>('RETAILOS_THERMAL_PRINTER_SERIAL_BAUD_RATE'), 9600);
    this.windowsPrinter = config.get<string>('RETAILOS_THERMAL_PRINTER_WINDOWS_QUEUE')?.trim() || undefined;
    this.includeLogo = config.get<string>('RETAILOS_THERMAL_PRINTER_INCLUDE_LOGO') === 'true';
  }

  async print(method: string, lines: string[], paperWidthMm: number) {
    const transport = this.transportFor(method);
    const jobId = randomUUID();
    const body = this.receiptDocument(lines, paperWidthMm);
    const job = this.queue.catch(() => undefined).then(() => this.send(transport, body));
    this.queue = job;
    await job;
    return { jobId, transport };
  }

  private async send(transport: PrinterTransport, body: Buffer) {
    if (transport === 'LAN_ESC_POS') return this.sendLan(body);
    if (transport === 'SERIAL_ESC_POS') return this.sendSerial(body);
    return this.sendWindowsRaw(body);
  }

  private async sendLan(body: Buffer) {
    const host = this.host;
    if (!host) throw new BadRequestException('LAN printing is not configured. Set RETAILOS_THERMAL_PRINTER_HOST on the PC running RetailOS.');
    if (!this.isPrivateIpv4(host)) throw new BadRequestException('The LAN thermal printer host must be a private IPv4 address.');
    await new Promise<void>((resolve, reject) => {
      const socket = new Socket();
      const timeout = setTimeout(() => socket.destroy(new Error('Timed out while connecting to the LAN thermal printer.')), 5000);
      const fail = (error: Error) => { clearTimeout(timeout); reject(new ServiceUnavailableException(`LAN thermal printer unavailable: ${error.message}`)); };
      socket.once('error', fail);
      socket.connect(this.port, host, () => socket.write(body, (error) => {
        clearTimeout(timeout);
        socket.end();
        if (error) fail(error); else resolve();
      }));
    });
  }

  private async sendSerial(body: Buffer) {
    const port = this.serialPort;
    if (!port) throw new BadRequestException('Serial printing is not configured. Pair the Bluetooth printer to a COM port (or connect USB serial) on the PC, then set RETAILOS_THERMAL_PRINTER_SERIAL_PORT.');
    if (!this.isSafeSerialPort(port)) throw new BadRequestException('The configured serial printer port is invalid. Use COM1 through COM256 or an absolute /dev path.');
    try {
      if (process.platform === 'win32') {
        const name = port.replace(/^\\\\\.\\/i, '').toUpperCase();
        await execFileAsync('mode.com', [`${name}:`, `BAUD=${this.serialBaudRate}`, 'PARITY=n', 'DATA=8', 'STOP=1']);
        writeFileSync(`\\\\.\\${name}`, body, { flag: 'w' });
      } else writeFileSync(port, body, { flag: 'w' });
    } catch (error) {
      throw new ServiceUnavailableException(`Serial thermal printer unavailable: ${this.errorMessage(error)}`);
    }
  }

  private async sendWindowsRaw(body: Buffer) {
    if (process.platform !== 'win32') throw new BadRequestException('Windows raw printing requires RetailOS API to run natively on the Windows PC, not inside Docker. Use LAN ESC/POS for Docker deployments.');
    const printer = this.windowsPrinter;
    if (!printer) throw new BadRequestException('Windows raw printing is not configured. Set RETAILOS_THERMAL_PRINTER_WINDOWS_QUEUE to the installed printer queue name.');
    const file = join(tmpdir(), `retailos-receipt-${randomUUID()}.bin`);
    try {
      writeFileSync(file, body, { flag: 'wx' });
      const script = this.rawPrintPowerShell(printer, file);
      await execFileAsync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000 });
    } catch (error) {
      throw new ServiceUnavailableException(`Windows thermal printer unavailable: ${this.errorMessage(error)}`);
    } finally {
      try { unlinkSync(file); } catch { /* The spooler can lock a failed temporary job briefly. */ }
    }
  }

  private receiptDocument(lines: string[], paperWidthMm: number) {
    const width = this.charactersForPaper(paperWidthMm);
    const divider = lines.indexOf('--------------------------------');
    const header = lines.slice(0, Math.max(0, divider)).flatMap((line) => this.wrap(this.ascii(line), width));
    const body = lines.slice(Math.max(0, divider)).flatMap((line) => this.wrap(this.ascii(line), width));
    const logo = this.includeLogo ? this.logo() : Buffer.alloc(0);
    return Buffer.concat([
      Buffer.from([0x1b, 0x40, 0x1b, 0x61, 0x01]),
      logo,
      Buffer.from(`\n${header.join('\n')}\n`, 'ascii'),
      Buffer.from([0x1b, 0x61, 0x00]),
      Buffer.from(`${body.join('\n')}\n\n\n\n\n`, 'ascii'),
      Buffer.from([0x1d, 0x56, 0x01]),
    ]);
  }

  private logo() {
    try { return readFileSync(join(process.cwd(), 'public', 'assets', 'taiping-hardware-logo-raster.bin')); }
    catch (error) { throw new BadRequestException(`Receipt logo is enabled but unavailable: ${this.errorMessage(error)}`); }
  }

  private transportFor(method: string): PrinterTransport {
    if (method === 'LAN_ESC_POS') return 'LAN_ESC_POS';
    // Saved configurations continue to work after removing the phone print-dialog paths.
    if (method === 'WINDOWS_RAW' || method === 'WINDOWS_USB') return 'WINDOWS_RAW';
    if (method === 'SERIAL_ESC_POS' || method === 'BLUETOOTH') return 'SERIAL_ESC_POS';
    throw new BadRequestException('Select LAN, Windows USB queue, or Bluetooth/USB serial in Printer settings. System print dialogs are not part of the PC print hub.');
  }

  private rawPrintPowerShell(printer: string, file: string) {
    const quote = (value: string) => value.replace(/'/g, "''");
    return `$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class RetailOSRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] public static extern int StartDocPrinter(IntPtr handle, int level, DOCINFO document);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);
  public static void Print(string printer, byte[] bytes) {
    IntPtr handle; if (!OpenPrinter(printer, out handle, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      var document = new DOCINFO { pDocName = "RetailOS receipt", pDataType = "RAW" };
      if (StartDocPrinter(handle, 1, document) == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
      try { if (!StartPagePrinter(handle)) throw new Win32Exception(Marshal.GetLastWin32Error()); try { int written; if (!WritePrinter(handle, bytes, bytes.Length, out written) || written != bytes.Length) throw new Win32Exception(Marshal.GetLastWin32Error()); } finally { EndPagePrinter(handle); } } finally { EndDocPrinter(handle); }
    } finally { ClosePrinter(handle); }
  }
}
'@
[RetailOSRawPrinter]::Print('${quote(printer)}', [System.IO.File]::ReadAllBytes('${quote(file)}'))`;
  }

  private portNumber(value: string | undefined, fallback: number) { const port = Number(value || fallback); return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback; }
  private baudRate(value: string | undefined, fallback: number) { const baudRate = Number(value || fallback); return Number.isInteger(baudRate) && baudRate >= 1200 && baudRate <= 921600 ? baudRate : fallback; }
  private charactersForPaper(width: number) { return width <= 58 ? 32 : width <= 76 ? 42 : width <= 82 ? 48 : 64; }
  private ascii(value: string) { return value.normalize('NFKD').replace(/[^\x20-\x7E]/g, '?'); }
  private wrap(value: string, width: number) { return value.length <= width ? [value] : value.match(new RegExp(`.{1,${width}}(?:\\s|$)|.{1,${width}}`, 'g')) || [value]; }
  private isPrivateIpv4(value: string) { const parts = value.split('.').map(Number); return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) && (parts[0] === 10 || parts[0] === 127 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168)); }
  private isSafeSerialPort(value: string) { return /^COM([1-9]|[1-9]\d|1\d{2}|2[0-4]\d|25[0-6])$/i.test(value.replace(/^\\\\\.\\/i, '')) || /^\/dev\/[A-Za-z0-9._/-]+$/.test(value); }
  private errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
}
