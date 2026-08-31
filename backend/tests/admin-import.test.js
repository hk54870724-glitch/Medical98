import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeCsvBuffer } from '../src/services/admin.service.js';
import { parseCsv } from '../src/utils/csv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(path.resolve(__dirname, '../../test-fixtures', name));

test('GBK 员工 CSV 正确解码且中文表头可识别', () => {
  const text = decodeCsvBuffer(fixture('employees_gbk.csv'));
  const rows = parseCsv(text);
  assert.ok(rows.length > 0, '应解析出数据行');
  assert.ok('工号' in rows[0], '应识别中文表头“工号”');
  assert.ok('姓名' in rows[0], '应识别中文表头“姓名”');
  assert.ok(rows[0]['姓名'], '姓名列应有内容');
});

test('UTF-8 员工 CSV 正确解码', () => {
  const text = decodeCsvBuffer(fixture('employees_utf8.csv'));
  const rows = parseCsv(text);
  assert.ok(rows.length > 0, '应解析出数据行');
  assert.ok('姓名' in rows[0], '应识别中文表头“姓名”');
});

test('UTF-8 BOM 应被去除', () => {
  const buf = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('工号,姓名\n1,张三')]);
  const text = decodeCsvBuffer(buf);
  assert.ok(!text.startsWith('\uFEFF'), '不应残留 BOM');
  assert.ok(text.startsWith('工号'), '应正确解码中文');
});

test('纯 ASCII CSV 正常解码', () => {
  const text = decodeCsvBuffer(Buffer.from('a,b\n1,2'));
  assert.equal(text, 'a,b\n1,2');
});
