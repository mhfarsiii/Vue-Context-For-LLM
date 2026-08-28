<template>
  <article>{{ slug }}</article>
</template>

<script setup lang="ts">
const route = useRoute()
const slug = route.params.slug
</script>
