<template>
  <div class="admin-page">
    <h1>Admin</h1>
    <p class="muted">Browse all users. Use search to filter. Click a chip to navigate.</p>

    <div class="toolbar">
      <input
        v-model="q"
        class="search"
        type="text"
        placeholder="Search by username, university, study line, or course…"
      />
      <select v-model="sortBy" class="sort">
        <option value="username">Username</option>
        <option value="university">University</option>
        <option value="study_line">Study line</option>
      </select>
    </div>

    <div v-if="loading" class="empty">Loading users…</div>
    <div v-else-if="err" class="empty">Error: {{ err }}</div>
    <div v-else-if="!isAdmin" class="empty">
      You don't have access to this page.
    </div>
    <div v-else>
      <div v-if="filtered.length === 0" class="empty">No users found.</div>
      <div class="list">
        <div v-for="u in filtered" :key="u.id" class="row">
          <RouterLink
            :to="{ path: '/profile', query: { u: u.id }}"
            class="avatar"
            :title="u.username"
          >
            <img v-if="u.avatar_src" :src="u.avatar_src" alt="" />
            <span v-else>{{ (u.username || '?').slice(0,1).toUpperCase() }}</span>
          </RouterLink>

          <div class="meta">
            <div class="name">
              <RouterLink :to="{ path: '/profile', query: { u: u.id }}">{{ u.username || 'Unknown' }}</RouterLink>
            </div>
            <div class="sub">
              <span v-if="u.university">{{ u.university }}</span>
              <span v-if="u.study_line"> · {{ u.study_line }}</span>
            </div>

            <div class="courses" v-if="(u.courses || []).length">
              <RouterLink
                v-for="c in u.courses"
                :key="c"
                class="chip"
                :to="{ path: '/course/'+c }"
                :title="'Open course '+c"
              >
                {{ c }}
              </RouterLink>
            </div>
          </div>

          <div class="actions">
            <RouterLink class="btn ghost" :to="{ path: '/messages', query: { to: u.id }}">Message</RouterLink>
            <button class="btn" @click="addFriend(u)" :disabled="requesting[u.id]">Add friend</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase, currentUser } from '../services/supabase'

const loading = ref(true)
const me = ref(null)
const isAdmin = ref(false)
const users = ref([])
const q = ref('')
const sortBy = ref('username')
const requesting = ref({})
const err = ref(null)

onMounted(async () => {
  try {
    // ensure we have the current auth user
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id || currentUser?.id;
    if (!uid) {
      isAdmin.value = false;
      loading.value = false;
      return;
    }

    // load my profile to check admin flag
    const { data: meProfile, error: meErr } = await supabase
      .from('profiles')
      .select('id, username, is_admin')
      .eq('id', uid)
      .maybeSingle();

    if (meErr) err.value = meErr.message;
    me.value = meProfile || null;
    isAdmin.value = !!meProfile?.is_admin;

    if (!isAdmin.value) {
      loading.value = false;
      return;
    }

    // fetch all users
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, university, study_line, courses, avatar_url')
      .order('username', { ascending: true });

    if (error) {
      err.value = error.message;
    } else {
      users.value = (data || []).map(u => ({
        ...u,
        avatar_src: resolveAvatar(u?.avatar_url),
        courses: normalizeCourses(u?.courses)
      }));
    }
  } catch (e) {
    err.value = String(e?.message || e);
  } finally {
    loading.value = false;
  }
});

function normalizeCourses(c) {
  if (!c) return []
  if (Array.isArray(c)) return c
  try { // stringified json or comma list
    const parsed = JSON.parse(c)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return String(c).split(',').map(s => s.trim()).filter(Boolean)
  }
}

function resolveAvatar(val) {
  if (!val) return ''
  // already a full URL
  if (/^https?:\/\//i.test(val)) return val
  // otherwise treat as path in avatars bucket
  const { data } = supabase.storage.from('avatars').getPublicUrl(val)
  return data?.publicUrl || ''
}

const filtered = computed(() => {
  let arr = [...users.value]
  const term = q.value.trim().toLowerCase()
  if (term) {
    arr = arr.filter(u => {
      const hay = [
        u.username,
        u.university,
        u.study_line,
        ...(u.courses || [])
      ].join(' ').toLowerCase()
      return hay.includes(term)
    })
  }
  arr.sort((a,b) => String(a[sortBy.value]||'').localeCompare(String(b[sortBy.value]||'')))
  return arr
})

async function addFriend(u) {
  try {
    requesting.value = { ...requesting.value, [u.id]: true }
    // Try to use friend_requests table (fall back silently if not present)
    await supabase.from('friend_requests').insert({
      requester_id: me.value.id,
      recipient_id: u.id,
      status: 'pending'
    })
  } finally {
    requesting.value = { ...requesting.value, [u.id]: false }
  }
}
</script>

<style scoped>
.admin-page { max-width: 980px; margin: 24px auto; padding: 0 16px; }
h1 { font-size: 28px; margin: 8px 0; }
.muted { opacity: .7; margin-bottom: 16px; }

.toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
.search { flex: 1 1 auto; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.08); color: #fff; }
.sort { padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.08); color: #fff; }

.empty { padding: 24px; opacity: .7; }

.list { display: grid; gap: 10px; }
.row { display: grid; grid-template-columns: 56px 1fr auto; gap: 12px; align-items: center; padding: 12px; border-radius: 12px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06); }
.avatar { width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,.1); display: grid; place-items: center; overflow: hidden; text-decoration: none; }
.avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.avatar span { font-weight: 700; }

.meta { min-width: 0; }
.name { font-weight: 700; margin-bottom: 2px; }
.name a { color: inherit; text-decoration: none; }
.sub { opacity: .75; font-size: 14px; }
.courses { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font-size: 12px; padding: 6px 8px; border-radius: 999px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12); text-decoration: none; color: inherit; }

.actions { display: flex; gap: 8px; }
.btn { padding: 8px 12px; border-radius: 10px; background: #6ea8ff33; color: #fff; border: 1px solid rgba(255,255,255,.16); cursor: pointer; }
.btn.ghost { background: transparent; }
.btn:disabled { opacity: .5; cursor: default; }
</style>
