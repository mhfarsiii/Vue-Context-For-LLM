export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  ssr: true,
  runtimeConfig: {
    apiSecret: '',
    public: {
      apiBase: '/api',
    },
  },
})
