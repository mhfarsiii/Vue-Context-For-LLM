<template>
  <div class="product">
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ id: string }>()
defineEmits<{ (e: 'select'): void }>()
</script>
