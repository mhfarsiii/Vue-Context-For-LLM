<template>
  <ProductCard id="1" />
</template>

<script setup lang="ts">
import ProductCard from '../components/ProductCard.vue'
import { useCatalog } from '../composables/useCatalog'
useCatalog()
</script>
