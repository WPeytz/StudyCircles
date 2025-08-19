<template>
  <div class="friends-page">
    <header class="head">
      <h1>Friends</h1>
      <p class="muted">Find classmates, manage requests, and see your study buddies.</p>
    </header>

    <!-- Invite link -->
    <section class="card">
      <h2>Invite a friend</h2>
      <div class="row">
        <button class="button" :disabled="inviteBusy || !isLoggedIn" @click="createInvite">
          {{ inviteBusy ? 'Creating…' : 'Create invite link' }}
        </button>
        <input
          v-if="inviteLink"
          class="input"
          :value="inviteLink"
          readonly
          @focus="$event.target.select()"
          @click="$event.target.select()"
        />
        <button v-if="inviteLink" class="button" @click="copyInvite">Copy</button>
      </div>
      <div v-if="!isLoggedIn" class="hint">Log in to create an invite link.</div>
      <div v-if="inviteErr" class="hint">{{ inviteErr }}</div>
    </section>

    <!-- Add friend -->
    <section class="card">
      <h2>Add a friend</h2>
      <div class="row">
        <input class="input" v-model="query" placeholder="Search by username or email…" @keyup.enter="addFriend" />
        <button class="button" :disabled="!query || busy.adding" @click="addFriend">{{ busy.adding ? 'Adding…' : 'Add' }}</button>
      </div>
      <div v-if="notice" class="hint">{{ notice }}</div>
    </section>

    <div class="grid">
      <!-- Incoming requests -->
      <section class="card">
        <h2>Incoming requests</h2>
        <div v-if="incoming.length === 0" class="muted">No incoming requests.</div>
        <div v-else class="list">
          <div v-for="r in incoming" :key="r.id" class="row item">
            <div class="avatar">{{ (r.username || r.email || 'U').slice(0,1).toUpperCase() }}</div>
            <div class="col">
              <div class="strong">{{ r.username || r.email }}</div>
              <div class="small muted">wants to be friends</div>
            </div>
            <div class="spacer"></div>
            <button class="button" :disabled="busy.accepting" @click="accept(r)">Accept</button>
            <button class="button" :disabled="busy.declining" @click="decline(r)">Decline</button>
          </div>
        </div>
      </section>

      <!-- Outgoing requests -->
      <section class="card">
        <h2>Outgoing requests</h2>
        <div v-if="outgoing.length === 0" class="muted">No outgoing requests.</div>
        <div v-else class="list">
          <div v-for="r in outgoing" :key="r.id" class="row item">
            <div class="avatar">{{ (r.username || r.email || 'U').slice(0,1).toUpperCase() }}</div>
            <div class="col">
              <div class="strong">{{ r.username || r.email }}</div>
              <div class="small muted">pending…</div>
            </div>
            <div class="spacer"></div>
            <button class="button" :disabled="busy.canceling" @click="cancel(r)">Cancel</button>
          </div>
        </div>
      </section>
    </div>

    <!-- Friends list -->
    <section class="card">
      <h2>Your friends</h2>
      <div v-if="friends.length === 0" class="muted">No friends yet.</div>
      <div v-else class="list">
        <div v-for="f in friends" :key="f.id" class="row item friend">
          <div class="avatar">{{ (f.username || f.email || 'U').slice(0,1).toUpperCase() }}</div>
          <div class="col info">
            <div class="name strong">{{ f.username || f.email }}</div>
            <div class="meta small muted">
              <span v-if="f.university">{{ f.university }}</span>
              <span v-if="f.university && f.study_line"> · </span>
              <span v-if="f.study_line">{{ f.study_line }}</span>
            </div>
            <div class="courses" v-if="Array.isArray(f.courses) && f.courses.length">
              <router-link
                v-for="c in f.courses"
                :key="c"
                :to="`/course/${c}`"
                class="badge"
              >
                {{ c }}
              </router-link>
            </div>
          </div>
          <div class="actions">
            <button class="button small danger" @click="removeFriend(f)">Remove</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase, currentUser } from '../services/supabase'

const me = currentUser
const isLoggedIn = computed(() => !!me.value)

const query = ref('')
const notice = ref('')
const busy = ref({ adding:false, accepting:false, declining:false, canceling:false })

const incoming = ref([])  // {id, sender_id, username, email}
const outgoing = ref([])  // {id, receiver_id, username, email}
const friends  = ref([])  // {id: friend_id, username, email}

const route = useRoute()
const router = useRouter()

const inviteBusy = ref(false)
const inviteLink = ref('')
const inviteErr  = ref('')

function clearNoticeSoon() { setTimeout(() => notice.value = '', 1500) }

async function createInvite() {
  inviteErr.value = ''
  inviteLink.value = ''
  if (!me.value) { inviteErr.value = 'Please log in first.'; return }
  inviteBusy.value = true
  try {
    const { data, error } = await supabase
      .from('friend_invites')
      .insert({ sender_id: me.value.id })
      .select('id')
      .single()
    if (error) { inviteErr.value = error.message; return }
    const url = `${window.location.origin}/friends?invite=${data.id}`
    inviteLink.value = url
    try { await navigator.clipboard.writeText(url); notice.value = 'Invite link copied!'; clearNoticeSoon() } catch {}
  } catch (e) {
    inviteErr.value = String(e?.message || e)
  } finally {
    inviteBusy.value = false
  }
}

function copyInvite() {
  if (!inviteLink.value) return
  navigator.clipboard.writeText(inviteLink.value)
  notice.value = 'Copied to clipboard'
  clearNoticeSoon()
}

async function addFriend() {
  if (!me.value) { notice.value = 'Please log in first.'; clearNoticeSoon(); return }
  const q = (query.value || '').trim()
  if (!q) return
  busy.value.adding = true
  notice.value = ''
  try {
    // 1) Try username in profiles
    const byUsername = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', q)
      .maybeSingle()

    let targetId = byUsername.data?.id || null

    // 2) Fallback: by email via helper view
    if (!targetId) {
      const { data: viaView } = await supabase
        .from('user_emails')
        .select('id, email')
        .ilike('email', q)
        .maybeSingle()
      if (viaView?.id) targetId = viaView.id
    }

    if (!targetId) { notice.value = 'User not found.'; clearNoticeSoon(); return }
    if (targetId === me.value.id) { notice.value = "You can't add yourself."; clearNoticeSoon(); return }

    const { error } = await supabase
      .from('friend_requests')
      .upsert({ sender_id: me.value.id, receiver_id: targetId, status: 'pending' }, { onConflict: 'sender_id,receiver_id' })

    if (error) { notice.value = error.message; return }
    notice.value = 'Request sent!'
    query.value = ''
    await fetchRequests()
    clearNoticeSoon()
  } finally {
    busy.value.adding = false
  }
}

async function accept(r) {
  if (!me.value) return
  busy.value.accepting = true
  try {
    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted' })
      .eq('id', r.id)
      .eq('receiver_id', me.value.id)
    if (error) { notice.value = error.message; return }

    // mutual friendship rows
    await supabase.from('friends').upsert([
      { user_id: me.value.id, friend_id: r.sender_id },
      { user_id: r.sender_id, friend_id: me.value.id },
    ], { onConflict: 'user_id,friend_id' })

    await Promise.all([fetchRequests(), fetchFriends()])
  } finally { busy.value.accepting = false }
}

async function decline(r) {
  if (!me.value) return
  busy.value.declining = true
  try {
    await supabase
      .from('friend_requests')
      .update({ status: 'declined' })
      .eq('id', r.id)
      .eq('receiver_id', me.value.id)
    await fetchRequests()
  } finally { busy.value.declining = false }
}

async function cancel(r) {
  if (!me.value) return
  busy.value.canceling = true
  try {
    await supabase
      .from('friend_requests')
      .delete()
      .eq('id', r.id)
      .eq('sender_id', me.value.id)
    await fetchRequests()
  } finally { busy.value.canceling = false }
}

async function removeFriend(f) {
  if (!me.value) return
  await supabase
    .from('friends')
    .delete()
    .or(`and(user_id.eq.${me.value.id},friend_id.eq.${f.id}),and(user_id.eq.${f.id},friend_id.eq.${me.value.id})`)
  await fetchFriends()
}

async function fetchRequests() {
  if (!me.value) return
  // incoming (pending where I am receiver)
  const inc = await supabase
    .from('friend_requests')
    .select('id, sender_id, receiver_id, status, created_at')
    .eq('receiver_id', me.value.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  // populate usernames/emails via profiles + view
  incoming.value = await hydratePeople(inc.data || [], 'sender_id')

  // outgoing (pending where I am sender)
  const out = await supabase
    .from('friend_requests')
    .select('id, sender_id, receiver_id, status, created_at')
    .eq('sender_id', me.value.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  outgoing.value = await hydratePeople(out.data || [], 'receiver_id')
}

async function fetchFriends() {
  if (!me.value) return
  const { data } = await supabase
    .from('friends')
    .select('friend_id')
    .eq('user_id', me.value.id)

  const ids = (data || []).map(r => r.friend_id)
  friends.value = await lookupProfiles(ids)
}

async function lookupProfiles(ids) {
  if (!ids.length) return []
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, username, email, university, study_line, courses')
    .in('id', ids)
  const byId = Object.fromEntries((profs || []).map(p => [p.id, p]))
  return ids.map(id => ({
    id,
    username: byId[id]?.username || null,
    email: byId[id]?.email || null,
    university: byId[id]?.university || null,
    study_line: byId[id]?.study_line || null,
    courses: Array.isArray(byId[id]?.courses) ? byId[id].courses : []
  }))
}

async function hydratePeople(rows, key) {
  const ids = rows.map(r => r[key]).filter(Boolean)
  const people = await lookupProfiles(ids)
  const map = Object.fromEntries(people.map(p => [p.id, p]))
  return rows.map(r => ({
    id: r.id,
    [key]: r[key],
    username: map[r[key]]?.username || null,
    email: map[r[key]]?.email || null,
    created_at: r.created_at,
  }))
}

async function acceptInviteToken(token) {
  inviteErr.value = ''
  if (!token) return
  try {
    // Fetch invite
    const { data: inv, error } = await supabase
      .from('friend_invites')
      .select('id, sender_id, used, used_at')
      .eq('id', token)
      .maybeSingle()
    if (error) { inviteErr.value = error.message; return }
    if (!inv) { inviteErr.value = 'Invalid invite.'; return }
    if (inv.used) { inviteErr.value = 'This invite link has already been used.'; return }

    if (!me.value) {
      // store for after login
      localStorage.setItem('pendingInviteToken', token)
      notice.value = 'Please log in to accept the invite.'
      clearNoticeSoon()
      return
    }

    // Make mutual friendships and mark invite used
    await supabase.from('friends').upsert([
      { user_id: me.value.id,        friend_id: inv.sender_id },
      { user_id: inv.sender_id,      friend_id: me.value.id }
    ], { onConflict: 'user_id,friend_id' })

    await supabase
      .from('friend_invites')
      .update({ used: true, used_at: new Date().toISOString(), used_by: me.value.id })
      .eq('id', inv.id)

    notice.value = 'Friend added!'
    await fetchFriends()
    clearNoticeSoon()

    // Clean URL (remove invite query param)
    const q = { ...route.query }
    delete q.invite
    router.replace({ query: q })
  } catch (e) {
    inviteErr.value = String(e?.message || e)
  }
}

async function bootstrap() {
  if (!supabase) return
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) {
    const token = route.query?.invite
    if (token) await acceptInviteToken(String(token))
    await Promise.all([fetchRequests(), fetchFriends()])
  }
}

onMounted(bootstrap)
watch(me, async (u) => {
  if (u?.id) {
    // process pending invite if present
    const pending = localStorage.getItem('pendingInviteToken')
    if (pending) {
      await acceptInviteToken(pending)
      localStorage.removeItem('pendingInviteToken')
    }
    await bootstrap()
  } else {
    incoming.value = []; outgoing.value = []; friends.value = []
  }
})

/*
-- SQL to create friend_invites (run in Supabase SQL editor):
create table if not exists public.friend_invites (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  used boolean not null default false,
  used_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
alter table public.friend_invites enable row level security;
drop policy if exists "friend_invites: select" on public.friend_invites;
create policy "friend_invites: select" on public.friend_invites for select using (true);
drop policy if exists "friend_invites: insert" on public.friend_invites;
create policy "friend_invites: insert" on public.friend_invites for insert to authenticated with check (auth.uid() = sender_id);
drop policy if exists "friend_invites: update" on public.friend_invites;
create policy "friend_invites: update" on public.friend_invites for update using (auth.uid() = sender_id or auth.uid() = used_by);
*/
</script>

<style scoped>
.friends-page { max-width: 980px; margin: 28px auto; padding: 0 12px; }
.head h1 { margin: 0 0 4px; }
.muted { opacity: .75; }
.small { font-size: 12px; }
.strong { font-weight: 600; }

.card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; margin: 12px 0; }
.row { display: flex; gap: 10px; align-items: center; }
.col { display: grid; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.list { display: grid; gap: 10px; margin-top: 8px; }
.item { background: rgba(0,0,0,0.12); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 10px; }
.spacer { flex: 1; }
.input { width: 100%; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px; color: #fff; }
.button { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px 12px; color: #fff; cursor: pointer; }
.avatar { width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,0.18); display: grid; place-items: center; font-weight: 700; }
.hint { margin-top: 6px; opacity: .9; }

.courses { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.badge { background: rgba(255,255,255,0.07); padding: 3px 8px; border-radius: 999px; font-size: 12px; }

@media (max-width: 720px) {
  .grid { grid-template-columns: 1fr; }
}

/* Friend row refinements */
.item.friend { align-items: center; padding: 12px; }
.item.friend .info { gap: 2px; }
.item.friend .name { font-size: 15px; }
.item.friend .meta { margin-top: 2px; }
.item.friend .actions { margin-left: 12px; display: flex; align-items: center; }

/* Make button compact and avoid full-width expansion */
.button { width: auto; white-space: nowrap; }
.button.small { padding: 6px 10px; font-size: 12px; border-radius: 7px; }
.button.danger { border-color: rgba(255, 99, 99, .35); background: rgba(255, 99, 99, .08); }
.button.danger:hover { background: rgba(255, 99, 99, .15); }

/* Badges for courses already exist; keep them tidy */
.courses { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.badge { background: rgba(255,255,255,0.07); padding: 3px 8px; border-radius: 999px; font-size: 12px; border: 1px solid rgba(255,255,255,0.12); }
</style>
