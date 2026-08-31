<template><MainLayout><div class="page-card"><h3>我的报销申请</h3><a-table :data="items"><template #columns><a-table-column title="申请单号" data-index="application_no"/><a-table-column title="年度" data-index="year_no"/><a-table-column title="报销日期" data-index="apply_date"/><a-table-column title="报销金额" data-index="total_reimburse_amount"/><a-table-column title="状态"><template #cell="{record}">{{ ['待审批','已通过','已驳回'][record.status] }}</template></a-table-column></template></a-table></div></MainLayout></template>
<script setup>
import {onMounted,ref} from 'vue';import MainLayout from '../layouts/MainLayout.vue';import {getMyApplications} from '../api/reimbursement';const items=ref([]);onMounted(async()=>{const r=await getMyApplications({page:1,pageSize:50});items.value=r.data.items;});
</script>
