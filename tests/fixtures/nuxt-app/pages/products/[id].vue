<template>
  <div>
    <ProductCard :product="product" @add-to-cart="onAdd" />
  </div>
</template>

<script setup lang="ts">
import ProductCard from '~/components/ProductCard.vue'
import type { Product } from '~/types/product'

const { product } = useProduct()
const cart = useCartStore()

function onAdd() {
  cart.add(product)
}
</script>
