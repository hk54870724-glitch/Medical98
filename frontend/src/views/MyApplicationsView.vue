<template>
  <MainLayout>
    <div class="page-card">
      <h3>我的报销申请</h3>
      <a-table :data="rows" :span-method="spanMethod">
        <template #columns>
          <a-table-column title="申请单号">
            <template #cell="{ record }">{{ record.isSummary ? '合计' : record.applicationNo }}</template>
          </a-table-column>
          <a-table-column title="年度" data-index="yearNo"/>
          <a-table-column title="报销日期" data-index="applyDate"/>
          <a-table-column title="发票姓名" data-index="invoiceName"/>
          <a-table-column title="发票号码" data-index="invoiceNo"/>
          <a-table-column title="发票金额" data-index="totalAmount"/>
          <a-table-column title="个人自付" data-index="selfPaid"/>
          <a-table-column title="报销金额" data-index="reimbursementAmount"/>
          <a-table-column title="状态">
            <template #cell="{ record }">{{ record.isSummary ? '' : statusText(record.status) }}</template>
          </a-table-column>
        </template>
      </a-table>
      <div v-if="yearTotals.length" style="margin-top:12px;padding:12px 16px;background:#f7f8fa;border-radius:4px;font-size:13px">
        <div style="font-weight:600;margin-bottom:6px">按年度小计</div>
        <div v-for="t in yearTotals" :key="t.yearNo" style="margin-bottom:4px">{{ t.yearNo }}年度：共 {{ t.count }} 单，小计 ￥{{ t.amount.toFixed(2) }}</div>
      </div>
    </div>
  </MainLayout>
</template>
<script setup>
import { onMounted, ref } from 'vue';
import MainLayout from '../layouts/MainLayout.vue';
import { getMyApplications } from '../api/reimbursement';

const rows = ref([]);
const yearTotals = ref([]);

const statusText = (s) => ['待审批', '已通过', '已驳回'][s] ?? '-';

// 申请单号、年度、报销日期三列按明细行数合并；合计行在申请单号列跨三列
const spanMethod = ({ rowIndex, columnIndex }) => {
  const row = rows.value[rowIndex];
  if (!row) return { rowspan: 1, colspan: 1 };
  if (row.isSummary) {
    if (columnIndex === 0) return { rowspan: 1, colspan: 3 };
    return { rowspan: 1, colspan: 1 };
  }
  if (columnIndex <= 2) {
    if (row.isFirst) return { rowspan: row.groupRowSpan, colspan: 1 };
    return { rowspan: 0, colspan: 0 };
  }
  return { rowspan: 1, colspan: 1 };
};

onMounted(async () => {
  const r = await getMyApplications({ page: 1, pageSize: 50 });
  const items = r.data.items || [];
  yearTotals.value = r.data.yearTotals || [];
  const arr = [];
  for (const it of items) {
    const details = it.details && it.details.length ? it.details : [{}];
    details.forEach((d, i) => {
      arr.push({
        isSummary: false,
        applicationNo: it.applicationNo,
        yearNo: it.yearNo,
        applyDate: it.applyDate,
        groupRowSpan: details.length,
        isFirst: i === 0,
        invoiceName: d.invoiceName ?? '-',
        invoiceNo: d.invoiceNo ?? '-',
        totalAmount: d.totalAmount ?? '-',
        selfPaid: d.selfPaid ?? '-',
        reimbursementAmount: d.reimbursementAmount ?? '-',
        status: d.status ?? ''
      });
    });
    arr.push({
      isSummary: true,
      totalAmount: it.totalInvoiceAmount,
      selfPaid: it.totalSelfPaid,
      reimbursementAmount: it.totalReimburseAmount
    });
  }
  rows.value = arr;
});
</script>
