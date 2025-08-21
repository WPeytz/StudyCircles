<template>
  <div class="settings-page">
    <header class="head">
      <h1>Settings</h1>
      <p class="muted">Manage your profile details and account.</p>
    </header>

    <!-- Profile basics -->
    <section class="card">
      <h2>Profile</h2>
      <div class="avatar-row">
        <div class="avatar" :class="{ empty: !avatarUrl }">
          <img v-if="avatarUrl" :src="avatarUrl" alt="avatar" />
          <span v-else>👤</span>
        </div>
        <div class="avatar-actions">
          <input ref="avatarFileEl" type="file" accept="image/*" style="display:none" @change="onPickAvatar" />
          <button class="button" @click="avatarFileEl && avatarFileEl.click()" :disabled="uploadingAvatar">
            {{ uploadingAvatar ? 'Uploading…' : 'Change avatar' }}
          </button>
          <div class="hint error" v-if="avatarErr">{{ avatarErr }}</div>
        </div>
      </div>
      <div class="grid">
        <label class="field">
          <span class="label">Username</span>
          <input class="input" v-model="form.username" placeholder="Choose a username" />
        </label>
        <label class="field">
          <span class="label">University</span>
          <select class="input" v-model="form.university">
            <option v-for="u in universities" :key="u.code" :value="u.code" :disabled="u.comingSoon">
              {{ u.name }}{{ u.comingSoon ? ' (coming soon)' : '' }}
            </option>
          </select>
        </label>
        <label class="field">
          <span class="label">Study line</span>
          <!-- If DTU is selected, show a dropdown of DTU study lines (with degree suffix) -->
          <select v-if="form.university === 'DTU'" class="input" v-model="form.study_line">
            <option v-for="s in dtuStudyLines" :key="s.code" :value="s.label">
              {{ s.label }}
            </option>
            <option value="">Other / not listed…</option>
          </select>
          <!-- Fallback: free text for non-DTU universities -->
          <input v-else class="input" v-model="form.study_line" placeholder="e.g., Artificial Intelligence and Data" />
        </label>
        <label class="field bio-field">
          <span class="label">Bio <span class="small muted">(max 100 characters)</span></span>
          <textarea
            class="input"
            rows="3"
            v-model="form.bio"
            :maxlength="100"
            @input="limitBio"
            placeholder="Tell others a bit about you (e.g., interests, what you’re looking for)"
          ></textarea>
          <div class="small muted count">{{ (form.bio || '').length }}/100</div>
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

const form = ref({ username: '', university: '', study_line: '', bio: '' })
const saving = ref(false)
const msg = ref('')
const err = ref('')

const resetBusy = ref(false)
const resetMsg = ref('')
const resetErr = ref('')

const avatarUrl = ref('')
const avatarFileEl = ref(null)
const uploadingAvatar = ref(false)
const avatarErr = ref('')

const universities = [
  { code: 'DTU',  name: 'DTU — Technical University of Denmark', comingSoon: false },
  { code: 'KU',   name: 'KU — University of Copenhagen',         comingSoon: true  },
  { code: 'AU',   name: 'AU — Aarhus University',                 comingSoon: true  },
  { code: 'AAU',  name: 'AAU — Aalborg University',               comingSoon: true  },
  { code: 'SDU',  name: 'SDU — University of Southern Denmark',   comingSoon: true  },
  { code: 'CBS',  name: 'CBS — Copenhagen Business School',       comingSoon: true  },
  { code: 'ITU',  name: 'ITU — IT University of Copenhagen',      comingSoon: true  },
  { code: 'RUC',  name: 'RUC — Roskilde University',              comingSoon: true  },
]

const dtuStudyLines = [
  // MSc programmes (source: https://www.dtu.dk/english/education/graduate/msc-programmes)
  { code: 'APPLIED_CHEM_MSC',          label: 'Applied Chemistry (MSc)' },
  { code: 'ARCH_ENG_MSC',              label: 'Architectural Engineering (MSc)' },
  { code: 'AUTONOMOUS_SYS_MSC',        label: 'Autonomous Systems (MSc)' },
  { code: 'BIOINFORMATICS_MSC',        label: 'Bioinformatics (MSc)' },
  { code: 'BIOMATERIAL_MED_MSC',       label: 'Biomaterial Engineering for Medicine (MSc)' },
  { code: 'BIOMED_ENG_MSC',            label: 'Biomedical Engineering (MSc)' },
  { code: 'BIOTECH_MSC',               label: 'Biotechnology (MSc)' },
  { code: 'BUSINESS_ANALYTICS_MSC',    label: 'Business Analytics (MSc)' },
  { code: 'CHEM_BIOCHEM_ENG_MSC',      label: 'Chemical and Biochemical Engineering (MSc)' },
  { code: 'CIVIL_ENG_MSC',             label: 'Civil Engineering (MSc)' },
  { code: 'COMM_TECH_SYS_DES_MSC',     label: 'Communication Technologies and System Design (MSc)' },
  { code: 'CS_MSC',                    label: 'Computer Science and Engineering (MSc)' },
  { code: 'DESIGN_INNOVATION_MSC',     label: 'Design and Innovation (MSc)' },
  { code: 'EARTH_SPACE_PHYS_ENG_MSC',  label: 'Earth and Space Physics and Engineering (MSc)' },
  { code: 'ELECTRICAL_ENG_MSC',        label: 'Electrical Engineering (MSc)' },
  { code: 'ENG_ACOUSTICS_MSC',         label: 'Engineering Acoustics (MSc)' },
  { code: 'ENG_LIGHT_MSC',             label: 'Engineering Light (MSc)' },
  { code: 'ENG_PHYSICS_MSC',           label: 'Engineering Physics (MSc)' },
  { code: 'ENV_ENG_MSC',               label: 'Environmental Engineering (MSc)' },
  { code: 'FOOD_TECH_MSC',             label: 'Food Technology (MSc)' },
  { code: 'HCAI_MSC',                  label: 'Human-Centered Artificial Intelligence (MSc)' },
  { code: 'IND_ENG_MGMT_MSC',          label: 'Industrial Engineering and Management (MSc)' },
  { code: 'MATERIALS_MANUF_ENG_MSC',   label: 'Materials and Manufacturing Engineering (MSc)' },
  { code: 'MMC_MSC',                   label: 'Mathematical Modelling and Computation (MSc)' },
  { code: 'MECH_ENG_MSC',              label: 'Mechanical Engineering (MSc)' },
  { code: 'OCEAN_ENG_MSC',             label: 'Ocean Engineering (MSc)' },
  { code: 'PHARM_DES_ENG_MSC',         label: 'Pharmaceutical Design and Engineering (MSc)' },
  { code: 'SUST_ENERGY_SYS_MSC',       label: 'Sustainable Energy Systems (MSc)' },
  { code: 'SUST_ENERGY_TECH_MSC',      label: 'Sustainable Energy Technologies (MSc)' },
  { code: 'SUST_FISH_AQUA_MSC',        label: 'Sustainable Fisheries and Aquaculture (MSc)' },
  { code: 'TECH_ENTRE_MSC',            label: 'Technology Entrepreneurship (MSc)' },
  { code: 'WIND_ENERGY_MSC',           label: 'Wind Energy (MSc)' },
  // Joint national programmes (MSc)
  { code: 'BUS_ADMIN_BIOENTRE_MSC',    label: 'Business Administration and Bioentrepreneurship (MSc, joint programme)' },
  { code: 'QUANTUM_INFO_SCI_MSC',      label: 'Quantum Information Science (MSc, joint programme)' },
  { code: 'HEALTH_INFORMATICS_MSC',    label: 'Health and Informatics (MSc, joint programme)' },

  // BSc programmes (from https://www.dtu.dk/uddannelse/bachelor/uddannelsesretninger)
  { code: 'ANV_MAT_BSC',        label: 'Anvendt Matematik (BSc)' },
  { code: 'BIOTEK_BSC',         label: 'Bioteknologi (BSc)' },
  { code: 'BYGTEK_BSC',         label: 'Byggeteknologi (BSc)' },
  { code: 'BYGNDES_BSC',        label: 'Bygningsdesign (BSc)' },
  { code: 'BAER_ENERGI_BSC',    label: 'Bæredygtigt Energidesign (BSc)' },
  { code: 'COMP_ENG_BSC',       label: 'Computer Engineering (BSc)' },
  { code: 'CYBERTEK_BSC',       label: 'Cyberteknologi (BSc)' },
  { code: 'DATA_MGMT_BSC',      label: 'Data Science og Management (BSc)' },
  { code: 'DESIGN_INNO_BSC',    label: 'Design og Innovation (BSc)' },
  { code: 'ELEKTRO_BSC',        label: 'Elektroteknologi (BSc)' },
  { code: 'FYS_ING_BSC',        label: 'Fysik og Ingeniørvidenskab (BSc)' },
  { code: 'GEN_ENG_BSC',        label: 'General Engineering (BSc)' },
  { code: 'GEO_RUM_BSC',        label: 'Geofysik og Rumteknologi (BSc)' },
  { code: 'KEMI_TECH_BSC',      label: 'Kemi og Teknologi (BSc)' },
  { code: 'AI_DATA_BSC',        label: 'Kunstig Intelligens og Data (BSc)' },
  { code: 'MED_TECH_BSC',       label: 'Medicin og Teknologi (BSc)' },
  { code: 'MECH_DESIGN_BSC',    label: 'Mekanisk design og Teknologi (BSc)' },
  { code: 'MILJO_BSC',          label: 'Miljøteknologi (BSc)' },
  { code: 'SOFT_BSC',           label: 'Softwareteknologi (BSc)' },
  { code: 'TEK_BIOMED_BSC',     label: 'Teknisk Biomedicin (BSc)' },
  { code: 'ONLINE_TECH_BSC',    label: 'Teknologi – digital uddannelse (BSc)' },

  // BEng programmes (from https://www.dtu.dk/uddannelse/diplomingenioer/uddannelsesretninger)
  { code: 'ARKTISK_BYG_INF_BENG',    label: 'Arktisk Byggeri og Infrastruktur (BEng)' },
  { code: 'BYG_INFRA_BENG',          label: 'Byggeri og Infrastruktur (BEng)' },
  { code: 'BYGNINGSDESIGN_BENG',     label: 'Bygningsdesign (BEng)' },
  { code: 'COMP_ENG_BENG',           label: 'Computer Engineering (BEng)' },
  { code: 'ELEKTRISK_ENERGI_BENG',   label: 'Elektrisk Energiteknologi (BEng)' },
  { code: 'ELEKTROTEK_BENG',         label: 'Elektroteknologi (BEng)' },
  { code: 'FISKERI_BENG',            label: 'Fiskeriteknologi (BEng)' },
  { code: 'FOEDEVARER_BENG',         label: 'Fødevaresikkerhed og -kvalitet (BEng)' },
  { code: 'GLOBAL_BUS_TECH_BENG',    label: 'Global Business og Teknologi (BEng)' },
  { code: 'IT_OEKONOMI_BENG',        label: 'IT og Økonomi (BEng)' },
  { code: 'KEMI_BIOTEK_BENG',        label: 'Kemi- og Bioteknik (BEng)' },
  { code: 'KEMITEK_IB_BENG',         label: 'Kemiteknik og International Business (BEng)' },
  { code: 'MASKINTEK_BENG',          label: 'Maskinteknik (BEng)' },
  { code: 'ONLINE_MASKINTEK_BENG',   label: 'Maskinteknik – digital uddannelse (BEng)' },
  { code: 'MOB_TRANSPORT_LOG_BENG',  label: 'Mobilitet, Transport og Logistik (BEng)' },
  { code: 'PROCES_INNO_BENG',        label: 'Proces og Innovation (BEng)' },
  { code: 'PRODUKTION_BENG',         label: 'Produktion (BEng)' },
  { code: 'SKIBS_MARITIM_BENG',      label: 'Skibsteknik og Maritimt Design (BEng)' },
  { code: 'SOFT_BENG',               label: 'Softwareteknologi (BEng)' },
  { code: 'SUNDHEDSTECH_BENG',       label: 'Sundhedsteknologi (BEng)' }
]

const userEmail = computed(() => me.value?.email || '')

function resolveAvatarPublic(val) {
  if (!val) return ''
  if (/^https?:\/\//i.test(val)) return val
  const key = String(val).replace(/^avatars\//, '')
  const { data } = supabase.storage.from('avatars').getPublicUrl(key)
  return data?.publicUrl || ''
}

async function hydrate() {
  err.value = ''
  msg.value = ''
  if (!me.value) return
  const { data, error } = await supabase
    .from('profiles')
    .select('username, university, study_line, avatar_url, bio')
    .eq('id', me.value.id)
    .maybeSingle()
  if (error) { err.value = error.message; return }
  if (data) {
    form.value.username = data.username || ''
    form.value.university = data.university || ''
    form.value.study_line = data.study_line || ''
    form.value.bio = data.bio || ''
    avatarUrl.value = resolveAvatarPublic(data.avatar_url)
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
      bio: (form.value.bio || '').slice(0, 100) || null,
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

function limitBio() {
  if (!form.value.bio) return
  if (form.value.bio.length > 100) {
    form.value.bio = form.value.bio.slice(0, 100)
  }
}

async function onPickAvatar(e) {
  const file = e?.target?.files?.[0]
  if (!file || !me.value) return
  uploadingAvatar.value = true
  avatarErr.value = ''
  try {
    const key = `${me.value.id}/${Date.now()}_${file.name}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(key, file, { upsert: true })
    if (upErr) { avatarErr.value = upErr.message; return }

    const { error: updErr } = await supabase
      .from('profiles')
      .update({ avatar_url: key })
      .eq('id', me.value.id)
    if (updErr) { avatarErr.value = updErr.message; return }

    avatarUrl.value = resolveAvatarPublic(key)
  } catch (err) {
    avatarErr.value = String(err?.message || err)
  } finally {
    uploadingAvatar.value = false
    if (avatarFileEl?.value) avatarFileEl.value.value = ''
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
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }
.field { display: grid; gap: 6px; align-content: start; }
.label { font-size: 13px; opacity: .85; }
.input { width: 100%; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px; color: #fff; }
.button { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px 12px; color: #fff; cursor: pointer; }
.hint { margin-left: 8px; opacity: .9; }
.hint.error { color: #ff9a9a; }

.avatar-row { display:flex; align-items:center; gap:12px; margin-bottom: 12px; }
.avatar { width: 64px; height: 64px; border-radius: 50%; overflow: hidden; background: rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.14); display:grid; place-items:center; }
.avatar img { width:100%; height:100%; object-fit: cover; display:block; }
.avatar.empty span { opacity:.8; }
.avatar-actions { display:flex; align-items:center; gap:10px; }

@media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }

.small { font-size: 12px; }
.bio-field .count { justify-self: end; }
</style>