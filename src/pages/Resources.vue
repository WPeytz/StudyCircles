<template>
  <div class="container">
    <div class="card" style="display:grid; gap:14px;">
      <h1>Resources</h1>

      <div style="display:grid; gap:10px; grid-template-columns: 2fr 1fr;">
        <div class="card">
          <h2>Upload</h2>
          <div class="small">PDFs, images, or archives. Requires Supabase config.</div>
          <div style="display:grid; gap:8px; margin-top:8px;">
            <input v-model="course" class="input" placeholder="Course code (e.g., 02465)" />
            <input v-model="title" class="input" placeholder="Title (e.g., 2023 Winter Exam)" />
            <select v-model="type" class="select">
              <option value="exam">Exam</option>
              <option value="notes">Notes</option>
              <option value="cheatsheet">Cheat Sheet</option>
            </select>
            <input type="file" class="file" @change="onFile" />
            <button class="button" @click="upload" :disabled="!file">Upload</button>
            <div class="small" v-if="message">{{ message }}</div>
          </div>
        </div>

        <div class="card">
          <h2>Filter</h2>
          <input v-model="q" class="input" placeholder="Search title or course..." />
        </div>
      </div>

      <div class="grid">
        <div v-for="r in filtered" :key="r.id" class="card">
          <div class="badge">{{ r.type }}</div>
          <h3>{{ r.title }}</h3>
          <div class="small">Course: {{ r.course }}</div>
          <a v-if="r.url" :href="r.url" target="_blank">View / Download</a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../services/supabase'

const q = ref('')
const course = ref('')
const title = ref('')
const type = ref('exam')
const file = ref(null)
const message = ref('')

const items = ref([]) // <— start empty

function onFile(e) {
  file.value = e.target.files?.[0] || null
}

function prettyName(name) {
  // remove a leading timestamp and underscore if present
  return name.replace(/^\d+_/, '')
}

async function fetchList() {
  if (!supabase) return
  const { data, error } = await supabase.storage.from('resources').list('', {
    limit: 100,
    offset: 0,
    sortBy: { column: 'name', order: 'desc' }
  })
  if (error) {
    console.error(error)
    return
  }
  items.value = (data || []).map(obj => {
    const key = `sc_meta_${obj.name}`
    let meta = null
    try { meta = JSON.parse(localStorage.getItem(key)) } catch {}
    const { data: pub } = supabase.storage.from('resources').getPublicUrl(obj.name)
    return {
      id: obj.id || obj.name,
      title: meta?.title || prettyName(obj.name),
      course: meta?.course || 'Unknown',
      type: meta?.type || 'file',
      url: pub.publicUrl
    }
  })
}

async function upload() {
  if (!file.value) return
  try {
    const path = `${Date.now()}_${file.value.name}`
    if (!supabase) {
      message.value = 'Supabase not configured. Add env vars and reload.'
      return
    }
    const { error } = await supabase.storage
      .from('resources')
      .upload(path, file.value, { contentType: file.value.type })

    if (error) throw error

    // Save simple metadata locally so the list shows course/title after navigation
    const meta = {
      title: title.value || file.value.name,
      course: course.value || 'Unknown',
      type: type.value || 'file'
    }
    try { localStorage.setItem(`sc_meta_${path}`, JSON.stringify(meta)) } catch {}

    // refresh list from storage so it persists across navigation
    await fetchList()

    title.value = ''; course.value=''; type.value='exam'; file.value = null
    message.value = 'Uploaded!'
    setTimeout(() => { message.value = '' }, 2000)
  } catch (err) {
    console.error(err)
    message.value = 'Upload failed. Check console.'
  }
}

const filtered = computed(() => {
  const t = q.value.toLowerCase()
  return items.value.filter(r =>
    r.title.toLowerCase().includes(t) ||
    (r.course || '').toLowerCase().includes(t)
  )
})

onMounted(fetchList)
</script>