import { defineStore } from 'pinia'
import { apiFetch } from '~/composables/useApi'

export const useCartStore = defineStore('cart', {
  state: () => ({ items: [] as string[] }),
  actions: {
    async fetchCart() {
      await apiFetch('/cart', { method: 'GET' })
    },
    async add(product: { id: string }) {
      await apiFetch('/cart', { method: 'POST', body: product })
      this.items.push(product.id)
    },
    async updateItem(itemId: string, quantity: number) {
      await apiFetch(`/cart/${itemId}`, { method: 'PUT', body: { quantity } })
    },
  },
})
