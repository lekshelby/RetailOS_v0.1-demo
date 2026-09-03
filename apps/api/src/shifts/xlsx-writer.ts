import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';

export type XlsxCell = string | number | Date | null | undefined;
export interface XlsxSheet { name: string; rows: XlsxCell[][]; widths?: number[]; }

const xml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const column = (index: number) => { let value = ''; for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) value = String.fromCharCode(65 + (n % 26)) + value; return value; };
const excelDate = (value: Date) => (value.getTime() / 86_400_000) + 25_569;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) { let value = n; for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0); table[n] = value >>> 0; }
  return table;
})();
const crc32 = (data: Buffer) => { let value = 0xffffffff; for (const byte of data) value = (value >>> 8) ^ crcTable[(value ^ byte) & 0xff]; return (value ^ 0xffffffff) >>> 0; };
const u16 = (value: number) => { const data = Buffer.alloc(2); data.writeUInt16LE(value & 0xffff); return data; };
const u32 = (value: number) => { const data = Buffer.alloc(4); data.writeUInt32LE(value >>> 0); return data; };

function zip(files: Array<{ name: string; content: string }>) {
  const local: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name); const data = Buffer.from(file.content, 'utf8'); const crc = crc32(data);
    const header = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name]);
    local.push(header, data);
    directory.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    offset += header.length + data.length;
  }
  const directoryData = Buffer.concat(directory);
  return Buffer.concat([...local, directoryData, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(directoryData.length), u32(offset), u16(0)]);
}

function sheetXml(sheet: XlsxSheet) {
  const rows = sheet.rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => {
    const ref = `${column(columnIndex)}${rowIndex + 1}`;
    if (value === null || value === undefined || value === '') return `<c r="${ref}"/>`;
    if (value instanceof Date) return `<c r="${ref}" s="2"><v>${excelDate(value)}</v></c>`;
    if (typeof value === 'number') return `<c r="${ref}" s="${rowIndex === 0 ? 1 : 3}"><v>${value}</v></c>`;
    return `<c r="${ref}" t="inlineStr" s="${rowIndex === 0 ? 1 : 0}"><is><t>${xml(value)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const widths = sheet.widths?.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('') ?? '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${widths}</cols><sheetData>${rows}</sheetData><autoFilter ref="A1:${column(Math.max(0, (sheet.rows[0]?.length ?? 1) - 1))}${Math.max(1, sheet.rows.length)}"/></worksheet>`;
}

export function createXlsx(sheets: XlsxSheet[]) {
  const files = [
    { name: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${xml(sheet.name).slice(0, 31)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Aptos"/></font><font><b/><sz val="10"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf xfId="0" fontId="0"/><xf xfId="0" fontId="1" applyFont="1"/><xf xfId="0" numFmtId="22" applyNumberFormat="1"/><xf xfId="0" numFmtId="4" applyNumberFormat="1"/></cellXfs></styleSheet>` },
    ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, content: sheetXml(sheet) })),
  ];
  return zip(files);
}

export async function writeXlsx(filePath: string, sheets: XlsxSheet[]) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, createXlsx(sheets));
}
