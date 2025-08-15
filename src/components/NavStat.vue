<template>
  <div class="card" style="display:flex; align-items:center; gap:12px;">
    <div style="font-size:26px;">📚</div>
    <div>
      <div class="small">{{ label }}</div>
      <div style="font-weight:700; font-size: 20px;">{{ value }}</div>
    </div>
  </div>
</template>

<script setup>
defineProps({ label: String, value: [String, Number] })
</script>