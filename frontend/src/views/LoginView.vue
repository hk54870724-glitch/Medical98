<template>
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px">
    <a-card style="width:min(420px,100%)">
      <h2 style="margin-top:0">企业医药费报销系统</h2>
      <a-form :model="form" @submit="submit">
        <a-form-item field="username" label="用户名" :rules="[{required:true,message:'请输入用户名'}]"><a-input v-model="form.username" /></a-form-item>
        <a-form-item field="password" label="密码" :rules="[{required:true,message:'请输入密码'}]"><a-input-password v-model="form.password" /></a-form-item>
        <a-button type="primary" html-type="submit" long :loading="loading">登录</a-button>
      </a-form>
    </a-card>
  </div>
</template>
<script setup>
import { reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { useRouter } from 'vue-router';
import { login } from '../api/auth';
const router = useRouter(); const loading = ref(false); const form = reactive({username:'',password:''});
const submit = async () => { loading.value=true; try { const r=await login(form); window.__user=r.data.user; router.push('/'); } catch(e) { Message.error({content:e.message,duration:5000}); } finally { loading.value=false; } };
</script>
