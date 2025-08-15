<template>
  <nav>
    <div class="container inner">
      <div class="brand">StudyCircles<span class="tag small"> MVP</span></div>
      <div class="links">
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/resources">Resources</RouterLink>
        <RouterLink to="/groups">Groups</RouterLink>
        <RouterLink to="/ask">Ask</RouterLink>
        <RouterLink to="/profile">Profile</RouterLink>
      </div>
    </div>
  </nav>
  <RouterView />
  <footer class="container small">
    Built fast with Vue + Vite. Connect Supabase in <code>.env</code> to enable uploads & auth.
  </footer>
</template>

<script setup>
</script>