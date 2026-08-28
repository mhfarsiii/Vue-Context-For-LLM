export interface Product {
  id: string
  name: string
  price: number
  variant?: ProductVariant
}

export interface ProductVariant {
  id: string
  sku: string
}

export interface Cart {
  id: string
  items: CartItem[]
}

export interface CartItem {
  productId: string
  quantity: number
}

/** Utility — should be omitted from domain model */
export type Maybe<T> = T | null

export interface ButtonProps {
  label: string
}
