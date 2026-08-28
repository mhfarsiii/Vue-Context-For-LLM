import axios from 'axios'

export function fetchItems() {
  return axios.get('/api/items')
}

export function createItem() {
  return axios.post('/api/items', {})
}
