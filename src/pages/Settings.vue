

<template>
  <div class="settings-page">
    <header class="head">
      <h1>Settings</h1>
      <p class="muted">Manage your profile details and account.</p>
    </header>

    <!-- Profile basics -->
    <section class="card">
      <h2>Profile</h2>
      <div class="grid">
        <label class="field">
          <span class="label">Username</span>
          <input class="input" v-model="form.username" placeholder="Choose a username" />
        </label>
        <label class="field">
          <span class="label">University</span>
          <input class="input" v-model="form.university" placeholder="e.g., DTU" />
        </label>
        <label class="field">
          <span class="label">Study line</span>
          <input class="input" v-model="form.study_line" placeholder="e.g., Artificial Intelligence and Data" />
        </label>
      </div>
      <div class="row">
        <button class="button" :disabled="saving" @click="saveBasics">{{ saving ? 'Saving…' : 'Save' }}</button>
        <div class="hint" v-if="msg">{{ msg }}</div>
        <div class="hint error" v-if="err">{{ err }}</div>
      </div>
    </section>

    <!-- Account (password/email management is handled via Supabase auth flows) -->
    <section class="card">
      <h2>Account</h2>
      <div class="row">
        <button class="button" @click="sendPasswordReset" :disabled="resetBusy || !userEmail">
          {{ resetBusy ? 'Sending…' : 'Send password reset email' }}
        </button>
        <span class="small muted" v-if="userEmail">to {{ userEmail }}</span>
      </div>
      <div class="hint" v-if="resetMsg">{{ resetMsg }}</div>
      <div class="hint error" v-if="resetErr">{{ resetErr }}</div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase, currentUser } from '../services/supabase'

const me = currentUser

const form = ref({ username: '', university: '', study_line: '' })
const saving = ref(false)
const msg = ref('')
const err = ref('')

const resetBusy = ref(false)
const resetMsg = ref('')
const resetErr = ref('')

const userEmail = computed(() => me.value?.email || '')

async function hydrate() {
  err.value = ''
  msg.value = ''
  if (!me.value) return
  const { data, error } = await supabase
    .from('profiles')
    .select('username, university, study_line')
    .eq('id', me.value.id)
    .maybeSingle()
  if (error) { err.value = error.message; return }
  if (data) {
    form.value.username = data.username || ''
    form.value.university = data.university || ''
    form.value.study_line = data.study_line || ''
  }
}

async function saveBasics() {
  if (!me.value) { err.value = 'Please log in.'; return }
  saving.value = true
  err.value = ''
  msg.value = ''
  try {
    const payload = {
      id: me.value.id,
      username: (form.value.username || '').trim() || null,
      university: (form.value.university || '').trim() || null,
      study_line: (form.value.study_line || '').trim() || null,
    }
    const { error } = await supabase.from('profiles').upsert(payload)
    if (error) { err.value = error.message; return }
    msg.value = 'Saved ✓'
  } catch (e) {
    err.value = String(e?.message || e)
  } finally {
    saving.value = false
    setTimeout(() => (msg.value = ''), 1500)
  }
}

async function sendPasswordReset() {
  resetErr.value = ''
  resetMsg.value = ''
  if (!userEmail.value) { resetErr.value = 'No email associated with this account.'; return }
  resetBusy.value = true
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(userEmail.value, {
      redirectTo: window.location.origin + '/profile'
    })
    if (error) { resetErr.value = error.message; return }
    resetMsg.value = 'Password reset email sent.'
  } catch (e) {
    resetErr.value = String(e?.message || e)
  } finally {
    resetBusy.value = false
    setTimeout(() => (resetMsg.value = ''), 2000)
  }
}

onMounted(() => { hydrate() })
</script>

<style scoped>
.settings-page { max-width: 900px; margin: 28px auto; padding: 0 12px; }
.head h1 { margin: 0 0 4px; }
.muted { opacity: .75; }
.card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; margin: 12px 0; }
.row { display: flex; gap: 10px; align-items: center; margin-top: 10px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field { display: grid; gap: 6px; }
.label { font-size: 13px; opacity: .85; }
.input { width: 100%; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px; color: #fff; }
.button { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px 12px; color: #fff; cursor: pointer; }
.hint { margin-left: 8px; opacity: .9; }
.hint.error { color: #ff9a9a; }
@media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
</style>