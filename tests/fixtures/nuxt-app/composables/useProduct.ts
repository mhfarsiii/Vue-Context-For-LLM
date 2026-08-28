import type { Product } from '~/types/product'

export function useProductList() {
  return useFetch<Product[]>('/api/products')
}

export function useCreateProduct() {
  return $fetch<Product>('/api/products', { method: 'POST' })
}
