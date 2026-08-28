<template>
  <div>
    <CheckoutSummary />
  </div>
</template>

<script setup lang="ts">
import CheckoutSummary from '~/components/CheckoutSummary.vue'
const cart = useCartStore()
</script>
