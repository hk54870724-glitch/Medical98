<template>
  <MainLayout>
    <div class="grid" style="gap:16px">
      <div class="stat-row">
        <a-card><a-statistic title="年度额度" :value="quota.annualLimit" :precision="2" prefix="￥" /></a-card>
        <a-card><a-statistic title="已通过" :value="quota.approvedAmount" :precision="2" prefix="￥" /></a-card>
        <a-card><a-statistic title="待审批" :value="quota.pendingAmount" :precision="2" prefix="￥" /></a-card>
        <a-card><a-statistic title="可用额度" :value="quota.availableAmount" :precision="2" prefix="￥" /></a-card>
      </div>
      <div class="page-card">
        <div class="toolbar">
          <a-select v-model="form.yearId" placeholder="报销年度" style="width:180px" @change="refreshQuota">
            <a-option v-for="y in context.availableYears" :key="y.id" :value="y.id">{{ y.yearNo || y.year_no }}年度</a-option>
          </a-select>
          <a-date-picker v-model="form.applyDate" value-format="YYYY-MM-DD" placeholder="报销日期" />
          <a-input :model-value="context.employee?.employeeNo || ''" disabled style="width:150px" />
          <a-input :model-value="context.employee?.name || ''" disabled style="width:150px" />
          <span v-if="context.children?.length" style="color:#86909c;font-size:13px">子女：<a-tag v-for="c in context.children" :key="c.id" color="arcoblue">{{ c.childName }}</a-tag></span>
          <a-button type="outline" @click="clearRows">清除内容</a-button>
        </div>
        <a-alert type="info" style="margin-bottom:12px">退休人员自动按退休人员分类；非退休人员依据发票姓名自动识别为职工本人或已登记子女。报销金额=个人自付×报销比例。</a-alert><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><a-upload :auto-upload="false" :show-file-list="false" accept="image/*" @before-upload="scanQr"><a-button>识别发票二维码图片</a-button></a-upload><a-textarea v-model="parseText" placeholder="可粘贴发票文本或扫描枪输出" :auto-size="{minRows:2,maxRows:4}" style="min-width:260px;flex:1"/><a-button @click="parse">辅助解析并填入首行</a-button></div>
        <div class="table-scroll">
          <a-table :data="form.details" :pagination="false" row-key="key">
            <template #columns>
              <a-table-column title="发票姓名"><template #cell="{record}"><a-input v-model="record.invoiceName" /></template></a-table-column>
              <a-table-column title="发票号码"><template #cell="{record}"><a-input v-model="record.invoiceNo" /></template></a-table-column>
              <a-table-column title="发票日期"><template #cell="{record}"><a-date-picker v-model="record.invoiceDate" value-format="YYYY-MM-DD" /></template></a-table-column>
              <a-table-column title="总金额"><template #cell="{record}"><a-input-number v-model="record.totalAmount" :min="0" /></template></a-table-column>
              <a-table-column title="个人自付"><template #cell="{record}"><a-input-number v-model="record.selfPaid" :min="0" @change="calc" /></template></a-table-column>
              <a-table-column title="报销类型"><template #cell="{record}"><a-select v-model="record.typeId"><a-option v-for="t in types" :key="t.id" :value="t.id">{{ t.categoryName }} / {{ t.name }}（{{ Math.round(t.reimbursementRate*100) }}%）</a-option></a-select></template></a-table-column>
              <a-table-column title="预计报销"><template #cell="{record}">￥{{ (Number(record.selfPaid||0)*Number(findRate(record.typeId)||0)).toFixed(2) }}</template></a-table-column>
              <a-table-column title="操作"><template #cell="{record}"><a-button status="danger" type="text" @click="removeRow(record.key)">删除</a-button></template></a-table-column>
            </template>
          </a-table>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:16px">
          <a-button @click="addRow">新增发票</a-button>
          <div>本次预计报销：<b>￥{{ requestedAmount.toFixed(2) }}</b>；提交后预计剩余：<b>￥{{ Math.max(0,quota.availableAmount-requestedAmount).toFixed(2) }}</b></div>
          <a-button type="primary" :loading="submitting" @click="submit">提交申请</a-button>
        </div>
      </div>
    </div>
  </MainLayout>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import MainLayout from '../layouts/MainLayout.vue';
import { getContext, getQuota, createApplication, getCategories } from '../api/reimbursement';
import http from '../api/http';
const context = reactive({availableYears:[],employee:null,children:[]});
const quota = reactive({annualLimit:0,approvedAmount:0,pendingAmount:0,availableAmount:0});
const localDefaultDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-20`;};
const form = reactive({yearId:null,applyDate:localDefaultDate(),details:[]});
const allTypes=ref([]); const submitting=ref(false); const parseText=ref('');
const types = computed(()=>allTypes.value);
const requestedAmount = computed(()=>form.details.reduce((s,r)=>s + Number(r.selfPaid||0)*Number(findRate(r.typeId)||0),0));
const findRate=(id)=>allTypes.value.find(t=>t.id===id)?.reimbursementRate||0;
const addRow = () => {
  form.details.push({
    key: crypto.randomUUID(),
    invoiceName: '',
    invoiceNo: '',
    invoiceDate: '',
    totalAmount: 0,
    selfPaid: 0,
    typeId: allTypes.value.length > 0 ? allTypes.value[0].id : null
  });
};
const removeRow=(key)=>{ if(form.details.length===1){clearRows();return;} form.details=form.details.filter(x=>x.key!==key); };
const clearRows=()=>{form.details=[];addRow();};
const refreshQuota=async()=>{ if(form.yearId){const r=await getQuota(form.yearId);Object.assign(quota,r.data);} };
const calc=()=>{};
const applyParsed=(d)=>{if(!form.details.length)addRow();const row=form.details[0];if(d.invoiceNo)row.invoiceNo=d.invoiceNo;if(d.invoiceDate)row.invoiceDate=d.invoiceDate;if(d.payerName)row.invoiceName=d.payerName;if(d.totalAmount)row.totalAmount=d.totalAmount;if(d.selfPaid!==undefined&&d.selfPaid!==null)row.selfPaid=d.selfPaid;};
const scanQr=async(file)=>{try{if(!('BarcodeDetector' in window))throw new Error('当前浏览器不支持二维码图片识别，请使用最新版Edge/Chrome或粘贴二维码解码文本');const detector=new BarcodeDetector({formats:['qr_code']});const bitmap=await createImageBitmap(file);const codes=await detector.detect(bitmap);bitmap.close();if(!codes.length)throw new Error('未识别到二维码，请上传清晰的发票二维码图片');const raw=codes[0].rawValue||'';if(!raw)throw new Error('二维码内容为空');if(/^https?:\/\//i.test(raw)){const r=await http.post('/parser/url-resolve',{url:raw});const parsed=r.data?.parsed;if(parsed&&parsed.invoiceNo){applyParsed(parsed);Message.success('网址票据已下载并解析，已填入首行');}else{Message.warning('二维码为网址，已下载文件但未能解析出发票信息，请手工核对');}}else{const r=await http.post('/parser/text',{text:raw,originalName:file.name});applyParsed(r.data);Message.success('发票二维码已识别并填入首行');}}catch(e){Message.error(e.message||'二维码识别失败')}return false;}; const parse=async()=>{if(!parseText.value.trim()){Message.warning('请先粘贴发票文本');return;} try{const r=await http.post('/parser/text',{text:parseText.value});applyParsed(r.data);Message.success('解析结果已填入首行');}catch(e){Message.error(e.message)}};
const submit=async()=>{ if(!form.yearId){Message.error('请选择报销年度');return;} if(!form.applyDate){Message.error('请选择报销日期');return;} for(let i=0;i<form.details.length;i++){const r=form.details[i];if(!r.invoiceName?.trim()){Message.error(`第${i+1}行缺少发票姓名`);return;}if(!r.invoiceNo?.trim()){Message.error(`第${i+1}行缺少发票号码`);return;}if(!r.invoiceDate){Message.error(`第${i+1}行缺少发票日期`);return;}if(Number(r.totalAmount)<=0){Message.error(`第${i+1}行总金额必须大于0`);return;}if(Number(r.selfPaid)<0||Number(r.selfPaid)>Number(r.totalAmount)){Message.error(`第${i+1}行个人自付金额必须在0至总金额之间`);return;}if(!r.typeId){Message.error(`第${i+1}行请选择报销类型`);return;}} submitting.value=true; try { const payload={yearId:form.yearId,applyDate:form.applyDate,details:form.details.map(r=>({invoiceName:r.invoiceName,invoiceNo:r.invoiceNo,invoiceDate:r.invoiceDate,totalAmount:Number(r.totalAmount||0),selfPaid:Number(r.selfPaid||0),typeId:r.typeId}))}; const r=await createApplication(payload); Message.success(`提交成功：${r.data.applicationNo}`); clearRows(); await refreshQuota(); } catch(e){Message.error(e.message);} finally{submitting.value=false;} };
onMounted(async()=>{try{ const c=await getContext();Object.assign(context,c.data); form.yearId=c.data.defaultYear.id; const r=await getCategories(); allTypes.value=r.data.flatMap(x=>x.types.map(t=>({...t,categoryName:x.name}))); addRow(); await refreshQuota(); }catch(e){Message.error(e.message);}});
</script>
