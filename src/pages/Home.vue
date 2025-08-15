<template>
  <div class="container">
    <div class="card" style="display:grid; gap:12px;">
      <h1>Welcome 👋</h1>
      <p class="small">
        Pick your university and courses to personalize your feed. This will be saved to your profile.
      </p>

      <div v-if="!user" class="card small">
        You are not logged in. Go to <RouterLink to="/profile">Profile</RouterLink> to create an account (email/password), then come back here to save your university & courses.
      </div>

      <div class="grid">
        <div class="card" style="display:grid; gap:10px;">
          <h2>University</h2>
          <select class="select" v-model="university">
            <option disabled value="">Choose your university</option>
            <option value="DTU">DTU (Technical University of Denmark)</option>
          </select>
        </div>

        <div class="card" style="display:grid; gap:10px;">
          <h2>Courses at {{ university || 'your university' }}</h2>
          <div class="small">Search by code or title (e.g. 02465 or reinforcement). Click a result to add it.</div>

          <input
            v-model="searchQuery"
            class="input"
            placeholder="Type at least 2 characters to search…"
          />
          <div v-if="loading" class="small">Searching…</div>

          <div v-if="matches.length" class="card" style="max-height: 280px; overflow:auto; display:grid; gap:6px;">
            <div
              v-for="c in matches"
              :key="c.code"
              class="card"
              style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;"
              @click="addCourse(c)"
            >
              <div>
                <div style="font-weight:600;">{{ c.code }}</div>
                <div class="small">{{ c.title }}</div>
              </div>
              <div class="badge" v-if="selectedCourses.includes(c.code)">Added</div>
            </div>
          </div>
          <div v-else-if="searchQuery && searchQuery.length >= 2 && !loading" class="small">No matches.</div>

          <h3 style="margin:8px 0 0;">Your selected courses</h3>
          <div v-if="!selectedCourses.length" class="small">No courses selected yet.</div>
          <div v-else style="display:flex; flex-wrap:wrap; gap:6px;">
            <span
              v-for="code in selectedCourses"
              :key="code"
              class="badge"
              style="display:inline-flex; align-items:center; gap:6px;"
            >
              {{ code }}
              <a href="#" class="small" @click.prevent="removeCourse(code)">×</a>
            </span>
          </div>

          <button class="button" :disabled="!user" @click="saveProfile">Save to Profile</button>
          <div v-if="notice" class="small">{{ notice }}</div>
        </div>
      </div>

      <div class="card">
        <h2>Quick Links</h2>
        <ol class="small">
          <li>Upload exam sets & notes in <RouterLink to='/resources'>Resources</RouterLink>.</li>
          <li>Create or join a <RouterLink to='/groups'>Study Group</RouterLink>.</li>
          <li>Ask a question in <RouterLink to='/ask'>Ask</RouterLink>.</li>
        </ol>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import NavStat from '../components/NavStat.vue'
import { supabase } from '../services/supabase'

const user = ref(null)
const university = ref('')
const selectedCourses = ref([])
const notice = ref('')

const searchQuery = ref('')
const matches = ref([])
const loading = ref(false)

onMounted(async () => {
  if (!supabase) return
  const { data: { user: u } } = await supabase.auth.getUser()
  user.value = u
  if (!u) return
  // Load existing profile if present
  const { data: profile } = await supabase.from('profiles')
    .select('university, courses')
    .eq('id', u.id)
    .single()
  if (profile) {
    university.value = profile.university || ''
    selectedCourses.value = Array.isArray(profile.courses) ? profile.courses : []
  }
})

function addCourse(c) {
  const code = typeof c === 'string' ? c : c.code
  if (!code) return
  if (!selectedCourses.value.includes(code)) {
    selectedCourses.value.push(code)
  }
}

function removeCourse(code) {
  selectedCourses.value = selectedCourses.value.filter(x => x !== code)
}

async function fetchMatches(q) {
  matches.value = []
  if (!supabase) return
  if (!q || q.length < 2 || university.value !== 'DTU') return
  loading.value = true
  const { data, error } = await supabase
    .from('courses')
    .select('code,title')
    .eq('university', 'DTU')
    .or(`code.ilike.%${q}%,title.ilike.%${q}%`)
    .limit(25)
  loading.value = false
  if (error) {
    console.error(error)
    return
  }
  matches.value = data || []
}

watch(searchQuery, (q) => {
  fetchMatches(q)
})

async function saveProfile() {
  if (!supabase || !user.value) return
  notice.value = ''
  const payload = {
    id: user.value.id,                 // profiles.id == auth user id
    university: university.value || null,
    courses: selectedCourses.value     // stored as JSONB array
  }
  const { error } = await supabase.from('profiles').upsert(payload)
  if (error) {
    console.error(error)
    notice.value = `Could not save: ${error.message}`
  } else {
    notice.value = 'Saved!'
    setTimeout(() => (notice.value = ''), 2000)
  }
}
</script>