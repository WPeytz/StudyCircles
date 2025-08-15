<template>
  <div class="container">
    <div class="card" style="display:grid; gap:14px;">
      <h1>Study Groups</h1>

      <div class="card">
        <h2>Create Group</h2>
        <div style="display:grid; gap:8px; margin-top:8px;">
          <input v-model="course" class="input" placeholder="Course (e.g., 02465)" />
          <input v-model="topic" class="input" placeholder="Topic (e.g., Dynamic Programming)" />
          <select v-model="mode" class="select">
            <option value="online">Online</option>
            <option value="in-person">In-person</option>
          </select>
          <input v-model="link" class="input" placeholder="Invite link (Discord/WhatsApp)" />
          <button class="button" @click="create">Create</button>
        </div>
      </div>

      <div class="grid">
        <div v-for="g in groups" :key="g.id" class="card">
          <div class="badge">{{ g.mode }}</div>
          <h3>{{ g.course }} · {{ g.topic }}</h3>
          <a :href="g.link" target="_blank">Join</a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const groups = ref([
  { id: 1, course: '02465', topic: 'Policy Iteration Rev', mode: 'online', link: 'https://discord.com' },
  { id: 2, course: 'Economics B', topic: 'Problem Set 3', mode: 'in-person', link: 'https://chat.whatsapp.com' },
])

const course = ref('')
const topic = ref('')
const mode = ref('online')
const link = ref('')

function create() {
  if (!course.value || !topic.value || !link.value) return
  groups.value.unshift({
    id: Date.now(), course: course.value, topic: topic.value, mode: mode.value, link: link.value
  })
  course.value = topic.value = link.value = ''
  mode.value = 'online'
}
</script>