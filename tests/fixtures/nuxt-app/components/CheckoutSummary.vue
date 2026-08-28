<template>
  <div>Checkout summary</div>
</template>

<script setup lang="ts">
defineProps<{ total: number }>()
const cart = useCartStore()
</script>
