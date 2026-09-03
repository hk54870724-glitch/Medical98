<template><MainLayout><div class="page-card"><div class="toolbar"><a-button @click="load">刷新</a-button><a-button @click="toggleAll">{{ allSelected ? '取消全选' : '全选' }}</a-button><a-button type="primary" :disabled="!selectedKeys.length" @click="batchPass">批量通过</a-button><a-button status="danger" :disabled="!selectedKeys.length" @click="onBatchReject">批量驳回</a-button></div><a-table :data="items" row-key="detailId" v-model:selectedKeys="selectedKeys" :row-selection="{type:'checkbox'}"><template #columns><a-table-column title="申请单" data-index="applicationNo"/><a-table-column title="员工" data-index="employeeName"/><a-table-column title="分类" data-index="categoryName"/><a-table-column title="发票姓名" data-index="invoiceName"/><a-table-column title="发票号码" data-index="invoiceNo"/><a-table-column title="日期" data-index="invoiceDate"/><a-table-column title="个人自付" data-index="selfPaid"/><a-table-column title="比例"><template #cell="{record}">{{Math.round(record.reimbursementRate*100)}}%</template></a-table-column><a-table-column title="报销金额" data-index="reimbursementAmount"/><a-table-column title="操作"><template #cell="{record}"><a-button size="small" type="primary" @click="pass(record)">通过</a-button><a-button size="small" status="danger" @click="reject(record)">驳回</a-button></template></a-table-column></template></a-table></div></MainLayout></template>
<script setup>
import {ref,onMounted,computed} from 'vue';import {Message} from '@arco-design/web-vue';import MainLayout from '../layouts/MainLayout.vue';import {getPendingApprovals,approveDetail,rejectDetail,batchApprove,batchReject} from '../api/reimbursement';
const items=ref([]),selectedKeys=ref([]);
const allSelected=computed(()=>items.value.length>0&&selectedKeys.value.length===items.value.length);
const load=async()=>{const r=await getPendingApprovals({page:1,pageSize:100});items.value=r.data.items;selectedKeys.value=[]};
const toggleAll=()=>{if(allSelected.value){selectedKeys.value=[];}else{selectedKeys.value=items.value.map(i=>i.detailId);}};
const error=e=>Message.error({content:e.message||'操作失败',duration:5000});
const pass=async(r)=>{try{await approveDetail({detailId:r.detailId});Message.success('已通过');load()}catch(e){error(e)}};
const reject=async(r)=>{try{await rejectDetail({detailId:r.detailId});Message.success('已驳回');load()}catch(e){error(e)}};
const batchPass=async()=>{try{await batchApprove({items:selectedKeys.value.map(k=>({detailId:k}))});load()}catch(e){error(e)}};
const onBatchReject=async()=>{try{await batchReject({items:selectedKeys.value.map(k=>({detailId:k}))});load()}catch(e){error(e)}};
onMounted(load);
</script>
