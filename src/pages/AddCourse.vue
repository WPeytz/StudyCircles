<template>
  <div class="add-course-page">
    <header class="head">
      <h1>Add courses</h1>
      <p class="muted">Search the catalog and add courses to your profile. Your current courses are listed below.</p>
    </header>

    <!-- Search -->
    <section class="card">
      <h2>Search courses</h2>
      <div class="row">
        <input class="input" v-model="q" placeholder="Type at least 2 characters to search…" @input="onType" @keyup.enter="doSearch" />
        <button class="button" :disabled="loading || shortQuery" @click="doSearch">{{ loading ? 'Searching…' : 'Search' }}</button>
      </div>
      <div v-if="err" class="hint">{{ err }}</div>

      <div v-if="results.length" class="results">
        <div v-for="r in results" :key="r.code" class="result-row">
          <div class="code">{{ r.code }}</div>
          <div class="title">{{ r.title }}</div>
          <div class="spacer"></div>
          <button class="button" :disabled="myCoursesSet.has(r.code) || saving" @click="addCourse(r.code)">
            {{ myCoursesSet.has(r.code) ? 'Added' : 'Add' }}
          </button>
        </div>
      </div>
      <div v-else-if="searched" class="muted">No results.</div>
    </section>

    <!-- Current selection -->
    <section class="card">
      <h2>Your courses</h2>
      <div v-if="!myCourses.length" class="muted">No courses yet. Add some above.</div>
      <div v-else class="list">
        <div v-for="c in myCourses" :key="c" class="item">
          <RouterLink :to="`/course/${c}`" class="course-link inline">
            <span class="code strong">{{ c }}</span>
            <span class="title small muted" v-if="titles[c]">{{ titles[c] }}</span>
          </RouterLink>
          <div class="spacer"></div>
          <button class="remove-x" :disabled="saving" @click="removeCourse(c)">×</button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase, currentUser } from '../services/supabase'
import { watch } from 'vue'

const me = currentUser

const q = ref('')
const results = ref([])
const loading = ref(false)
const searched = ref(false)
const err = ref('')

const myCourses = ref([])
const titles = ref({})
const myCoursesSet = computed(() => new Set(myCourses.value))
const saving = ref(false)

const MIN = 2
const shortQuery = computed(() => (q.value || '').trim().length < MIN)
let typeTimer
function onType () {
  clearTimeout(typeTimer)
  if (shortQuery.value) { results.value = []; searched.value = false; err.value=''; return }
  typeTimer = setTimeout(() => { doSearch() }, 250)
}

async function hydrateMyCourses() {
  if (!me.value) { myCourses.value = []; return }
  const { data, error } = await supabase
    .from('profiles')
    .select('courses')
    .eq('id', me.value.id)
    .maybeSingle()
  if (!error && data?.courses) {
    myCourses.value = data.courses
    window.dispatchEvent(new CustomEvent('studycircles:courses-updated', { detail: myCourses.value }))
    await hydrateTitles(data.courses)
  } else {
    myCourses.value = []
  }
}

async function hydrateTitles(codes) {
  const missing = (codes || []).filter(c => c && !titles.value[c])
  if (!missing.length) return
  const { data, error } = await supabase
    .from('courses')
    .select('code,title')
    .in('code', missing)
  if (!error && Array.isArray(data)) {
    const map = { ...titles.value }
    for (const row of data) if (row?.code) map[row.code] = row.title
    titles.value = map
  }
}

async function doSearch() {
  const term = (q.value || '').trim()
  if (term.length < MIN) { return }
  err.value = ''
  results.value = []
  searched.value = true
  loading.value = true
  try {
    const isCode = /^\d{2,}$/.test(term)
    let query = supabase.from('courses').select('code,title').limit(50)
    if (isCode) query = query.ilike('code', `%${term}%`)
    else query = query.ilike('title', `%${term}%`)
    const { data, error } = await query
    if (error) { err.value = error.message; return }
    results.value = data || []
  } catch (e) {
    err.value = String(e?.message || e)
  } finally {
    loading.value = false
  }
}

async function addCourse(code) {
  if (!me.value) { err.value = 'Please log in first.'; return }
  if (!code) return
  saving.value = true
  try {
    const next = Array.from(new Set([...(myCourses.value || []), code]))
    const { error } = await supabase
      .from('profiles')
      .update({ courses: next })
      .eq('id', me.value.id)
    if (error) { err.value = error.message; return }
    myCourses.value = next
    window.dispatchEvent(new CustomEvent('studycircles:courses-updated', { detail: next }))
    await hydrateTitles([code])
  } catch (e) {
    err.value = String(e?.message || e)
  } finally {
    saving.value = false
  }
}

async function removeCourse(code) {
  if (!me.value) return
  saving.value = true
  try {
    const next = (myCourses.value || []).filter(c => c !== code)
    const { error } = await supabase
      .from('profiles')
      .update({ courses: next })
      .eq('id', me.value.id)
    if (error) { err.value = error.message; return }
    myCourses.value = next
    window.dispatchEvent(new CustomEvent('studycircles:courses-updated', { detail: next }))
  } catch (e) {
    err.value = String(e?.message || e)
  } finally {
    saving.value = false
  }
}

// ...

onMounted(async () => {
  await hydrateMyCourses()
  if (!shortQuery.value && q.value) { doSearch() }
})

// 👇 Watch for login changes
watch(me, async (val) => {
  if (val) {
    await hydrateMyCourses()
  } else {
    myCourses.value = []
  }
})
</script>

<style scoped>
.add-course-page { max-width: 900px; margin: 28px auto; padding: 0 12px; }
.head h1 { margin: 0 0 4px; }
.muted { opacity: .75; }
.card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; margin: 12px 0; }
.row { display: flex; gap: 10px; align-items: center; }
.input { width: 100%; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px; color: #fff; }
.button { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px 12px; color: #fff; cursor: pointer; }
.result-row .button {
  padding: 4px 10px;
  font-size: 13px;
  width: auto;
  white-space: nowrap;
}
.results { display: grid; gap: 8px; margin-top: 10px; }
.result-row { display: flex; gap: 10px; align-items: center; background: rgba(0,0,0,0.12); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 10px; }
.result-row .code { font-weight: 700; min-width: 80px; }
.result-row .title { opacity: .95; }
.list { display: grid; gap: 8px; margin-top: 8px; }
.item { background: rgba(0,0,0,0.12); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 10px; display: flex; align-items: center; gap: 12px; }
.item .button { flex: 0 0 auto; }
.spacer { flex: 1; }
.hint { margin-top: 8px; color: #ffb3b3; }
.strong { font-weight: 600; }
.small { font-size: 12px; }
.course-link { color: inherit; text-decoration: none; cursor: pointer; }
.course-link.inline { display: inline-flex; gap: 12px; align-items: baseline; }
.course-link .code { white-space: nowrap; }
.course-link .title { white-space: nowrap; text-overflow: ellipsis; overflow: hidden; max-width: 70vw; }
.button.danger { padding: 2px 8px; font-size: 12px; }
.button.danger.slim { padding: 2px 8px; }
.remove-x {
  background: transparent;
  border: none;
  color: #ff6b6b;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  padding: 0 6px;
}
.remove-x:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>