<template>
  <div class="card">
    <ProductImage />
    <BaseButton @click="$emit('add-to-cart')">Add</BaseButton>
    <slot />
  </div>
</template>

<script setup lang="ts">
import ProductImage from './nested/ProductImage.vue'
import BaseButton from './BaseButton.vue'

defineProps<{
  product: { id: string; name: string }
}>()

defineEmits<{
  (e: 'add-to-cart'): void
}>()

const cart = useCartStore()
</script>
