<template>
  <a-config-provider :component-size="isMobile ? 'small' : 'medium'">
    <router-view />
  </a-config-provider>
</template>

<script setup>
import { computed } from 'vue';
const isMobile = computed(() => window.innerWidth < 768);
</script>
