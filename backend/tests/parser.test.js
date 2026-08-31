import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInvoice, extractInvoiceFieldsFromUrl } from '../src/services/parser.service.js';

// 用户提供的江苏省医疗门诊收费票据（电子）样票文本
const jiangsuSample = `其他信息
业务流水号：88361875 门诊号：P0001140980-0 就诊日期：20230430 11:09:01
医疗机构类型：三级甲等综合医保类型：职工在职医保编号：0001140980 性别：男
医保统筹基金支付：196.04 其他支付：0.00 个人账户支付：797.50 个人现金支付：0.00
个人自付：0.00
大病保险支付：0.00
其他保险支付：0.00
医疗救助支付：0.00
个人账户余额：23,689.46 支付方式：
个人自费：0
备注：
江苏省医疗门诊收费票据（电子）
票据代码：32060123 票据号码：0022739009
交款人统一社会信用代码：**************6735 校验码：138973
交款人：黄晓涛开票日期：2023-04-30
项目名称数量/单位金额（元） 备注项目名称数量/单位金额（元） 备注
检查费1.00/项717.28
化验费1.00/项140.00
治疗费1.00/项80.70
西药费1.00/项55.56
金额合计（大写）玖佰玖拾叁元伍角肆分
收款单位（章）： 复核人：80138 收款人：70004
真伪查验、报销入账反馈，请登录江苏省财政电子票据公共服务平台（http://einvoice.jsczt.cn)。财政电子票据可作为报销凭证，请妥善保管。
(小写)￥993.54`;

test('江苏电子医疗票据：发票号码/日期/交款人/总金额/自付正确解析', async () => {
  const r = await parseInvoice({ text: jiangsuSample });
  assert.equal(r.invoiceNo, '0022739009');
  assert.equal(r.invoiceDate, '2023-04-30');
  assert.equal(r.payerName, '黄晓涛');
  assert.equal(r.totalAmount, 993.54);
  assert.equal(r.selfPaid, 0);
});

test('交款人姓名后同行带“开票日期”时不被吞入', async () => {
  const text = `票据号码：12345678\n开票日期：2024-05-01\n交款人：李四开票日期：2024-05-01\n金额合计：￥200.00`;
  const r = await parseInvoice({ text });
  assert.equal(r.payerName, '李四');
  assert.equal(r.totalAmount, 200);
});

test('金额合计（小写）与 (小写)￥ 独立行均能解析总金额', async () => {
  const text = `发票号码：87654321\n开票日期：2024-05-01\n交款人：王五\n金额合计（小写）￥300.50`;
  const r = await parseInvoice({ text });
  assert.equal(r.totalAmount, 300.5);
  const text2 = `发票号码：87654321\n开票日期：2024-05-01\n交款人：王五\n金额合计（大写）叁佰元\n(小写)￥300.00`;
  const r2 = await parseInvoice({ text: text2 });
  assert.equal(r2.totalAmount, 300);
});

test('个人自费/个人现金支付也能识别为自付金额', async () => {
  const r = await parseInvoice({ text: '发票号码：12345678\n开票日期：2024-05-01\n交款人：张三\n金额合计：￥100.00\n个人自费：20.50' });
  assert.equal(r.selfPaid, 20.5);
  const r2 = await parseInvoice({ text: '发票号码：12345678\n开票日期：2024-05-01\n交款人：张三\n金额合计：￥100.00\n个人现金支付：30' });
  assert.equal(r2.selfPaid, 30);
});

test('票据查验页 URL 提取票据代码/号码/校验码', () => {
  const f = extractInvoiceFieldsFromUrl('http://einvoice.jsczt.cn/page/32060123/0022739009/138973');
  assert.equal(f.invoiceCode, '32060123');
  assert.equal(f.invoiceNo, '0022739009');
  assert.equal(f.checkCode, '138973');
  assert.equal(extractInvoiceFieldsFromUrl('http://example.com/other'), null);
  assert.equal(extractInvoiceFieldsFromUrl('not a url'), null);
});

test('查验页 URL 文本解析不再报“无法识别”，返回发票号码', async () => {
  const r = await parseInvoice({ text: 'http://einvoice.jsczt.cn/page/32060123/0022739009/138973' });
  assert.equal(r.invoiceNo, '0022739009');
  assert.equal(r.sourceType, 'URL');
});
