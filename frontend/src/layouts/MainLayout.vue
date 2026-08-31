<template>
  <a-layout class="page">
    <a-layout-header style="background:#fff;padding:0 16px;display:flex;align-items:center;gap:16px;box-shadow:0 1px 4px rgba(0,0,0,.06)">
      <strong style="font-size:18px;white-space:nowrap">企业医药费报销系统</strong>
      <a-menu mode="horizontal" :selected-keys="[route.path]" @menu-item-click="go">
        <a-menu-item key="/apply">报销申请</a-menu-item>
        <a-menu-item key="/my-applications">我的申请</a-menu-item>
        <a-menu-item v-if="canApprove" key="/approvals">审批</a-menu-item>
        <a-menu-item v-if="isAdmin" key="/admin/years">年度账套</a-menu-item>
        <a-menu-item v-if="isAdmin" key="/admin/rules">报销规则</a-menu-item>
        <a-menu-item v-if="isAdmin" key="/admin/employees">员工主数据</a-menu-item>
        <a-menu-item v-if="isAdmin" key="/admin/users">账号</a-menu-item>
      </a-menu>
      <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
        <span style="font-size:13px;color:#4e5969">{{ user?.employeeName || user?.username }}</span>
        <a-tag>{{ user?.role }}</a-tag>
        <a-button type="text" @click="doLogout">退出</a-button>
      </div>
    </a-layout-header>
    <a-layout-content style="padding:16px">
      <slot />
    </a-layout-content>
  </a-layout>
</template>
<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { logout } from '../api/auth';
const route = useRoute(); const router = useRouter();
const user = computed(() => window.__user || null);
const isAdmin = computed(() => user.value?.role === 'ADMIN');
const canApprove = computed(() => ['HR','FINANCE','ADMIN'].includes(user.value?.role));
const go = (path) => router.push(path);
const doLogout = async () => { await logout(); window.__user = null; router.push('/login'); };
</script>
