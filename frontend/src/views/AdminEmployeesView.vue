<template>
  <MainLayout>
    <div class="page-card">
      <div class="toolbar">
        <a-input v-model="keyword" placeholder="工号/姓名/部门" style="width:240px"/>
        <a-button @click="load">查询</a-button>
        <a-button type="primary" @click="openCreate">新增员工</a-button>
        <a-upload :auto-upload="false" :show-file-list="false" @before-upload="onFile"><a-button>CSV导入覆盖</a-button></a-upload>
      </div>
      <a-table :data="items">
        <template #columns>
          <a-table-column title="工号" data-index="employee_no"/>
          <a-table-column title="姓名" data-index="name"/>
          <a-table-column title="性别"><template #cell="{record}">{{record.gender==='M'?'男':'女'}}</template></a-table-column>
          <a-table-column title="部门" data-index="department"/>
          <a-table-column title="入职" data-index="hire_date"/>
          <a-table-column title="状态"><template #cell="{record}">{{record.enabled===false?'停用':record.employment_status}}</template></a-table-column>
          <a-table-column title="操作">
            <template #cell="{record}">
              <a-button size="small" @click="openEdit(record)">编辑</a-button>
              <a-button size="small" @click="openChildren(record)">子女管理</a-button>
              <a-popconfirm v-if="record.enabled" content="确认停用该员工？其子女将同步停用" @ok="remove(record)">
                <a-button size="small" status="danger">停用</a-button>
              </a-popconfirm>
              <a-button v-else size="small" status="success" @click="activateEmp(record)">启用</a-button>
            </template>
          </a-table-column>
        </template>
      </a-table>
      <a-modal v-model:visible="visible" title="员工信息" @ok="save"><a-form :model="form"><a-form-item label="工号"><a-input v-model="form.employeeNo"/></a-form-item><a-form-item label="姓名"><a-input v-model="form.name"/></a-form-item><a-form-item label="性别"><a-select v-model="form.gender"><a-option value="M">男</a-option><a-option value="F">女</a-option></a-select></a-form-item><a-form-item label="部门"><a-input v-model="form.department"/></a-form-item><a-form-item label="入职日期"><a-input v-model="form.hireDate" placeholder="YYYY-MM-DD"/></a-form-item><a-form-item label="离职日期"><a-input v-model="form.leaveDate" placeholder="YYYY-MM-DD，可留空"/></a-form-item><a-form-item label="状态"><a-select v-model="form.employmentStatus"><a-option value="ACTIVE">在职</a-option><a-option value="RESIGNED">离职</a-option><a-option value="RETIRED">退休</a-option></a-select></a-form-item></a-form></a-modal>
      <a-drawer v-model:visible="childVisible" :title="`${childEmployee?.name||''} - 子女管理`" :width="650"><div class="toolbar"><a-button type="primary" @click="openChildCreate">新增子女</a-button></div><a-table :data="childrenItems"><template #columns><a-table-column title="姓名" data-index="child_name"/><a-table-column title="性别"><template #cell="{record}">{{record.gender==='M'?'男':record.gender==='F'?'女':'-'}}</template></a-table-column><a-table-column title="出生日期" data-index="birth_date"/><a-table-column title="状态"><template #cell="{record}">{{record.enabled?'正常':`停用${record.disabled_date?'(自'+record.disabled_date+')':''}`}}</template></a-table-column><a-table-column title="操作"><template #cell="{record}"><a-button size="small" @click="openChildEdit(record)">编辑</a-button><a-button v-if="record.enabled" size="small" status="danger" @click="openDisableChild(record)">停用</a-button><a-button v-else size="small" status="success" @click="activateChild(record)">启用</a-button></template></a-table-column></template></a-table></a-drawer>
      <a-modal v-model:visible="childFormVisible" title="子女信息" @ok="saveChild"><a-form :model="childForm"><a-form-item label="姓名"><a-input v-model="childForm.childName"/></a-form-item><a-form-item label="性别"><a-select v-model="childForm.gender"><a-option value="M">男</a-option><a-option value="F">女</a-option></a-select></a-form-item><a-form-item label="出生日期"><a-input v-model="childForm.birthDate" placeholder="YYYY-MM-DD"/></a-form-item></a-form></a-modal>
      <a-modal v-model:visible="disableVisible" title="停用子女" @ok="confirmDisable"><a-form :model="disableForm"><a-form-item label="停用起始日期" required><a-date-picker v-model="disableForm.disabledDate" value-format="YYYY-MM-DD" style="width:100%"/></a-form-item></a-form></a-modal>
    </div>
  </MainLayout>
</template>
<script setup>
import {ref,onMounted,reactive} from 'vue';import {Message} from '@arco-design/web-vue';import MainLayout from '../layouts/MainLayout.vue';import {employees,createEmployee,updateEmployee,deleteEmployee,enableEmployee,importEmployees,children,createChild,updateChild,deleteChild,enableChild} from '../api/admin';
const items=ref([]),keyword=ref(''),visible=ref(false),childVisible=ref(false),childFormVisible=ref(false),disableVisible=ref(false),childEmployee=ref(null),childrenItems=ref([]);
const form=reactive({id:null,employeeNo:'',name:'',gender:'M',department:'',hireDate:'',leaveDate:'',employmentStatus:'ACTIVE'});const childForm=reactive({id:null,childName:'',gender:'M',birthDate:''});const disableForm=reactive({id:null,disabledDate:''});
const error=e=>Message.error(e.message||'操作失败',5000);const load=async()=>{try{const r=await employees({keyword:keyword.value,page:1,pageSize:100});items.value=r.data.items}catch(e){error(e)}};
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const openCreate=()=>{Object.assign(form,{id:null,employeeNo:'',name:'',gender:'M',department:'',hireDate:'',leaveDate:'',employmentStatus:'ACTIVE'});visible.value=true};const openEdit=r=>{Object.assign(form,{id:r.id,employeeNo:r.employee_no,name:r.name,gender:r.gender,department:r.department||'',hireDate:r.hire_date,leaveDate:r.leave_date||'',employmentStatus:r.employment_status});visible.value=true};
const save=async()=>{try{if(!form.employeeNo.trim())throw new Error('工号不能为空');if(!form.name.trim())throw new Error('姓名不能为空');if(!form.hireDate)throw new Error('入职日期不能为空');const p={employeeNo:form.employeeNo.trim(),name:form.name.trim(),gender:form.gender,department:form.department,hireDate:form.hireDate,leaveDate:form.leaveDate||null,employmentStatus:form.employmentStatus};if(form.id)await updateEmployee(form.id,p);else await createEmployee(p);visible.value=false;Message.success('员工已保存');load()}catch(e){error(e)}};
const remove=async r=>{try{await deleteEmployee(r.id);Message.success('员工及其子女已停用');load()}catch(e){error(e)}};
const activateEmp=async r=>{try{await enableEmployee(r.id);Message.success('员工已启用');load()}catch(e){error(e)}};
const openChildren=async r=>{childEmployee.value=r;childVisible.value=true;try{const x=await children(r.id);childrenItems.value=x.data}catch(e){error(e)}};const openChildCreate=()=>{Object.assign(childForm,{id:null,childName:'',gender:'M',birthDate:''});childFormVisible.value=true};const openChildEdit=r=>{Object.assign(childForm,{id:r.id,childName:r.child_name,gender:r.gender||'M',birthDate:r.birth_date||''});childFormVisible.value=true};
const saveChild=async()=>{try{if(!childForm.childName.trim())throw new Error('子女姓名不能为空');if(childForm.id)await updateChild(childForm.id,{childName:childForm.childName.trim(),gender:childForm.gender,birthDate:childForm.birthDate||null});else await createChild(childEmployee.value.id,{childName:childForm.childName.trim(),gender:childForm.gender,birthDate:childForm.birthDate||null});childFormVisible.value=false;const x=await children(childEmployee.value.id);childrenItems.value=x.data;Message.success('子女信息已保存')}catch(e){error(e)}};
const openDisableChild=r=>{disableForm.id=r.id;disableForm.disabledDate=today();disableVisible.value=true;};
const confirmDisable=async()=>{try{if(!disableForm.disabledDate)throw new Error('请选择停用起始日期');await deleteChild(disableForm.id,{disabledDate:disableForm.disabledDate});disableVisible.value=false;const x=await children(childEmployee.value.id);childrenItems.value=x.data;Message.success('子女已停用')}catch(e){error(e)}};
const activateChild=async r=>{try{await enableChild(r.id);const x=await children(childEmployee.value.id);childrenItems.value=x.data;Message.success('子女已启用')}catch(e){error(e)}};
const onFile=async file=>{try{const f=new FormData();f.append('file',file);await importEmployees(f);Message.success('导入成功');load()}catch(e){error(e)}return false};onMounted(load);
</script>
