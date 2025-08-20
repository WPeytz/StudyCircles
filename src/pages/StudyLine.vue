<template>
  <div class="studyline-page">
    <header class="head">
      <h1>{{ decodedStudy }}</h1>
      <p class="muted">People who chose this study line</p>
    </header>

    <section class="card">
      <div v-if="loading" class="muted">Loading…</div>
      <div v-else-if="people.length === 0" class="muted">No one here yet.</div>

      <div v-else class="list">
        <div v-for="p in people" :key="p.id" class="item row">
          <div class="avatar">{{ (p.username || p.email || 'U').slice(0,1).toUpperCase() }}</div>
          <div class="col">
            <div class="strong">{{ p.username || p.email }}</div>
            <div class="small muted">{{ p.university || '—' }}</div>
            <div class="courses" v-if="Array.isArray(p.courses) && p.courses.length">
              <router-link v-for="c in p.courses" :key="c" :to="`/course/${c}`" class="badge">
                {{ c }}
              </router-link>
            </div>
          </div>
          <div class="spacer"></div>
          <button
            v-if="p.id !== me?.id"
            class="button"
            :disabled="busy[p.id] === true || pending.has(p.id)"
            @click="sendFriend(p.id)"
            :title="pending.has(p.id) ? 'Request already sent' : 'Send friend request'"
          >
            {{ pending.has(p.id) ? 'Requested' : (busy[p.id] ? 'Sending…' : 'Add friend') }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { supabase, currentUser } from '../services/supabase'

const me = currentUser
const route = useRoute()

const study = ref('')
const decodedStudy = computed(() => {
  try { return decodeURIComponent(study.value || '') } catch { return study.value || '' }
})

const loading = ref(false)
const people = ref([])
const busy = ref({})
const pending = ref(new Set())

onMounted(async () => {
  study.value = (route.query?.value || '') + ''
  await bootstrap()
})

watch(() => route.query.value, async (v) => {
  study.value = (v || '') + ''
  await bootstrap()
})

async function bootstrap() {
  people.value = []
  pending.value = new Set()
  if (!decodedStudy.value) return
  loading.value = true
  try {
    // Load people with this study line (excluding me)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, email, university, courses, study_line')
      .eq('study_line', decodedStudy.value)
      .neq('id', me.value?.id || '')
      .order('username', { ascending: true })

    people.value = error ? [] : (data || [])

    // Preload which ones already have a pending request from me
    if (me.value && people.value.length) {
      const ids = people.value.map(p => p.id)
      const { data: reqs } = await supabase
        .from('friend_requests')
        .select('receiver_id, status')
        .eq('sender_id', me.value.id)
        .in('receiver_id', ids)
      for (const r of (reqs || [])) {
        if (r.status && r.status !== 'declined') pending.value.add(r.receiver_id)
      }
    }
  } finally {
    loading.value = false
  }
}

async function sendFriend(targetId) {
  if (!me.value || !targetId) return
  busy.value = { ...busy.value, [targetId]: true }
  try {
    const { error } = await supabase
      .from('friend_requests')
      .upsert(
        { sender_id: me.value.id, receiver_id: targetId, status: 'pending' },
        { onConflict: 'sender_id,receiver_id' }
      )
    if (!error) pending.value.add(targetId)
  } finally {
    busy.value = { ...busy.value, [targetId]: false }
  }
}
</script>

<style scoped>
.studyline-page { max-width: 1000px; margin: 28px auto; padding: 0 12px; }
.head h1 { margin: 0 0 4px; }
.muted { opacity: .75; }
.small { font-size: 12px; }
.strong { font-weight: 600; }

.card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; margin: 12px 0; }
.row { display: flex; gap: 10px; align-items: center; }
.col { display: grid; gap: 4px; }
.list { display: grid; gap: 10px; margin-top: 8px; }
.item { background: rgba(0,0,0,0.12); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 10px; }
.spacer { flex: 1; }
.avatar { width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,0.18); display: grid; place-items: center; font-weight: 700; }

.badge { background: rgba(255,255,255,0.07); padding: 3px 8px; border-radius: 999px; font-size: 12px; border: 1px solid rgba(255,255,255,0.12); }
.courses { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
</style>