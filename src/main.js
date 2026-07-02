import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import { buildApartment } from './apartment.js'

// --- Auth & State ---
const API_BASE = ''
let authToken = localStorage.getItem('anna_token')
let currentUserId = localStorage.getItem('anna_userId')
const playerState = {
  playerName: '',
  affection: 0,
  mood: 'indifferent',
  moodEmoji: '',
  sessionCount: 0,
  lastSeen: null,
  memories: [],
  voiceEnabled: true,
}
const chatMessages = []

const STAGES = [
  { min: 0,  name: 'stranger' },
  { min: 20, name: 'acquaintance' },
  { min: 40, name: 'rival' },
  { min: 60, name: 'friend' },
  { min: 80, name: 'close' },
]

function getStage(affection) {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (affection >= STAGES[i].min) return STAGES[i]
  }
  return STAGES[0]
}

const container = document.getElementById('viewer')

const scene = new THREE.Scene()

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000)
camera.position.set(0.0, 1.4, 2.0)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(window.devicePixelRatio)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
renderer.outputColorSpace = THREE.SRGBColorSpace
container.appendChild(renderer.domElement)

// Dark night sky — no sunset horizon
scene.background = new THREE.Color(0x070710)
scene.environment = null

// Apartment
const { group: apartment } = buildApartment()
scene.add(apartment)

const hemi = new THREE.HemisphereLight(0x223344, 0x111122, 0.3)
scene.add(hemi)

const ambient = new THREE.AmbientLight(0x334466, 0.15)
scene.add(ambient)

const dir = new THREE.DirectionalLight(0xffd9a0, 0.8)
dir.position.set(-1, 4, 3)
dir.castShadow = true
dir.shadow.mapSize.set(2048, 2048)
dir.shadow.camera.near = 0.5
dir.shadow.camera.far = 20
dir.shadow.camera.left = -12
dir.shadow.camera.right = 6
dir.shadow.camera.top = 4
dir.shadow.camera.bottom = -12
scene.add(dir)

const cityFill = new THREE.DirectionalLight(0x6688bb, 0.4)
cityFill.position.set(5, 2, -4)
scene.add(cityFill)

const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(0, 1.2, 0)
controls.update()

const clock = new THREE.Clock()
let currentVRM = null
let nextBlinkTime = 0
let blinkPhase = 0
const restQuaternions = {}
let boneZSign = 1
const _dQ = new THREE.Quaternion()
const _dE = new THREE.Euler()

// --- Speech & Lip Sync ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
const analyser = audioCtx.createAnalyser()
analyser.fftSize = 256
const frequencyData = new Uint8Array(analyser.frequencyBinCount)

let isSpeaking = false
let useAnalyser = false
let mouthValue = 0
const vowelCurrent = { aa: 0, ih: 0, ou: 0 }
const VOWELS = ['aa', 'ih', 'ou', 'ee', 'oh']

function browserTTS(text) {
  window.speechSynthesis.cancel()
  isSpeaking = true
  useAnalyser = false
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.onend = () => { isSpeaking = false }
  utterance.onerror = () => { isSpeaking = false }
  window.speechSynthesis.speak(utterance)
}

async function speak(text) {
  audioCtx.resume()
  if (!authToken) { browserTTS(text); return }
  try {
    const res = await fetch(`${API_BASE}/api/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const audio = new Audio(URL.createObjectURL(await res.blob()))
    const source = audioCtx.createMediaElementSource(audio)
    source.connect(analyser)
    analyser.connect(audioCtx.destination)
    useAnalyser = true
    audio.onplay = () => { isSpeaking = true }
    audio.onended = () => { isSpeaking = false }
    audio.play()
  } catch {
    browserTTS(text)
  }
}

function getSpeechAmplitude(elapsed) {
  if (!isSpeaking) return 0
  if (useAnalyser) {
    analyser.getByteFrequencyData(frequencyData)
    let peak = 0
    for (let i = 1; i < 20; i++) if (frequencyData[i] > peak) peak = frequencyData[i]
    return Math.min(1, peak / 210)
  }
  // Product of sines — naturally hits zero at each zero-crossing, no DC offset
  return Math.max(0,
    Math.sin(elapsed * 12.6) * Math.abs(Math.sin(elapsed * 3.8))
  )
}

function updateLipSync(vrm, elapsed, delta) {
  if (!vrm.expressionManager) return

  const amplitude = getSpeechAmplitude(elapsed)
  const trackRate = isSpeaking ? 22 : 30  // close faster than we open
  mouthValue += (amplitude - mouthValue) * Math.min(1, delta * trackRate)
  if (mouthValue < 0.002) mouthValue = 0

  if (mouthValue < 0.03) {
    const close = Math.min(1, delta * 18)
    for (const v of VOWELS) {
      if (vowelCurrent[v]) { vowelCurrent[v] *= (1 - close); vrm.expressionManager.setValue(v, vowelCurrent[v]) }
    }
    return
  }

  // Derive per-vowel weights from frequency bands when analyser is live,
  // otherwise cycle at syllable rate (~5 Hz)
  let aaW, ihW, ouW
  if (useAnalyser) {
    analyser.getByteFrequencyData(frequencyData)
    let lo = 0, mid = 0, hi = 0
    for (let i = 0; i < 5; i++) lo += frequencyData[i]
    for (let i = 5; i < 11; i++) mid += frequencyData[i]
    for (let i = 11; i < 18; i++) hi += frequencyData[i]
    lo /= 5; mid /= 6; hi /= 7
    const total = lo + mid + hi + 0.001
    aaW = lo / total
    ihW = mid / total
    ouW = hi / total
  } else {
    const phase = (elapsed * 5.2) % 3.0
    if (phase < 1.0) { aaW = 1 - phase; ihW = phase;       ouW = 0 }
    else if (phase < 2.0) { const p = phase - 1; aaW = 0; ihW = 1 - p; ouW = p }
    else { const p = phase - 2; aaW = p; ihW = 0; ouW = 1 - p }
  }

  const rate = Math.min(1, delta * 28)
  vowelCurrent.aa += (aaW * mouthValue          - vowelCurrent.aa) * rate
  vowelCurrent.ih += (ihW * mouthValue * 0.65   - vowelCurrent.ih) * rate
  vowelCurrent.ou += (ouW * mouthValue * 0.5    - vowelCurrent.ou) * rate

  vrm.expressionManager.setValue('aa', vowelCurrent.aa)
  vrm.expressionManager.setValue('ih', vowelCurrent.ih)
  vrm.expressionManager.setValue('ou', vowelCurrent.ou)
  vrm.expressionManager.setValue('ee', 0)
  vrm.expressionManager.setValue('oh', 0)
}

// --- Mood System ---

// Subtle bone offsets per mood — Z-only on arms (proven portable across VRM versions).
// lua/rua = left/right upper arm Z delta (inside boneZSign so version-neutral).
// hZ/hY = head tilt/turn, sX = spine lean.
const moodPoseTable = {
  irritated:   { luaZ:  0.2,  ruaZ: -0.2,  sX: -0.03, hZ:  0.04 },
  flustered:   { luaZ:  0.05, ruaZ: -0.05, sX:  0.015, hZ: -0.07, hY:  0.05 },
  indifferent: { luaZ: -0.08, ruaZ:  0.08, sX: -0.02 },
  reluctant:   { luaZ:  0.1,  ruaZ: -0.1,  hY:  0.06 },
  softening:   { luaZ: -0.05, ruaZ:  0.05, sX:  0.01, hZ: -0.03 },
  annoyed:     { luaZ:  0.25, ruaZ: -0.25, sX: -0.03, hZ:  0.03 },
  smug:        { hZ:   0.06,  hY:  -0.05,  sX: -0.01 },
  warm:        { luaZ: -0.12, ruaZ:  0.12, sX:  0.02, hZ: -0.02 },
  angry:       { luaZ:  0.3,  ruaZ: -0.3,  sX: -0.04, hZ:  0.02 },
}
const moodPoseTarget  = { luaZ: 0, ruaZ: 0, hZ: 0, hY: 0, sX: 0 }
const moodPoseCurrent = { luaZ: 0, ruaZ: 0, hZ: 0, hY: 0, sX: 0 }

const moodTable = {
  irritated:   { angry: 0.3 },
  flustered:   { Surprised: 0.4, happy: 0.15 },
  indifferent: { neutral: 1.0, relaxed: 0.2 },
  reluctant:   { angry: 0.15, relaxed: 0.1 },
  softening:   { happy: 0.25, relaxed: 0.15 },
  annoyed:     { angry: 0.5 },
  smug:        { happy: 0.3, angry: 0.1 },
  warm:        { happy: 0.6 },
  angry:       { angry: 0.85 },
}

const moodExpressions = new Set()
for (const weights of Object.values(moodTable))
  for (const name of Object.keys(weights)) moodExpressions.add(name)

const moodCurrent = {}
const moodTarget = {}
for (const name of moodExpressions) { moodCurrent[name] = 0; moodTarget[name] = 0 }

const validatedExpressions = new Set()
const warnedExpressions = new Set()

function setMood(moodName) {
  for (const name of moodExpressions) moodTarget[name] = 0
  const weights = moodTable[moodName]
  if (!weights) { console.warn(`Unknown mood: ${moodName}`); return }
  for (const [name, w] of Object.entries(weights)) moodTarget[name] = w

  for (const k of Object.keys(moodPoseTarget)) moodPoseTarget[k] = 0
  const pose = moodPoseTable[moodName]
  if (pose) Object.assign(moodPoseTarget, pose)
}

function updateMood(vrm, delta) {
  if (!vrm.expressionManager) return
  const rate = Math.min(1, delta * 3.5)
  for (const name of moodExpressions) {
    moodCurrent[name] += (moodTarget[name] - moodCurrent[name]) * rate
    if (Math.abs(moodCurrent[name]) < 0.001) moodCurrent[name] = 0

    if (!validatedExpressions.has(name)) {
      const expr = vrm.expressionManager.getExpression(name)
      if (!expr) {
        if (!warnedExpressions.has(name)) {
          console.warn(`Expression "${name}" not found on this model — skipping`)
          warnedExpressions.add(name)
        }
        validatedExpressions.add(name)
        continue
      }
      validatedExpressions.add(name)
    }
    if (warnedExpressions.has(name)) continue
    vrm.expressionManager.setValue(name, moodCurrent[name])
  }
}

window.setMood = setMood

window.resetAnna = async function () {
  if (authToken && currentUserId) {
    await fetch(`${API_BASE}/api/state/${currentUserId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        player_name: '', affection: 0, mood: 'indifferent', mood_emoji: '',
        session_count: 0, last_seen: null, memories: [], voice_enabled: true,
      }),
    })
    localStorage.removeItem(`anna_history_${currentUserId}`)
  }
  localStorage.removeItem('anna_token')
  localStorage.removeItem('anna_userId')
  location.reload()
}

// --- State Persistence ---
const loginForm = document.getElementById('login-form')
const loginStatus = document.getElementById('login-status')
const chatInputRow = document.getElementById('chat-input-row')
const chatLog = document.getElementById('chat-log')
const chatInput = document.getElementById('chat-input')

function handleSessionExpired() {
  authToken = null
  currentUserId = null
  localStorage.removeItem('anna_token')
  localStorage.removeItem('anna_userId')
  loginStatus.textContent = 'Session expired'
  loginForm.style.display = 'flex'
  chatInputRow.style.display = 'none'
}

async function loadState() {
  if (!currentUserId || !authToken) return
  const res = await fetch(`${API_BASE}/api/state/${currentUserId}`, {
    headers: { 'Authorization': `Bearer ${authToken}` },
  })
  if (res.status === 401) { handleSessionExpired(); throw new Error('unauthorized') }
  if (!res.ok) return
  const data = await res.json()
  if (data.playerName !== undefined) playerState.playerName = data.playerName || data.player_name || ''
  if (data.affection !== undefined) playerState.affection = data.affection
  if (data.mood) playerState.mood = data.mood
  if (data.moodEmoji || data.mood_emoji) playerState.moodEmoji = data.moodEmoji || data.mood_emoji
  if (data.sessionCount !== undefined || data.session_count !== undefined) playerState.sessionCount = data.sessionCount ?? data.session_count ?? 0
  if (data.memories) playerState.memories = data.memories
  if (data.voiceEnabled !== undefined || data.voice_enabled !== undefined) playerState.voiceEnabled = data.voiceEnabled ?? data.voice_enabled ?? true
  if (playerState.mood && moodTable[playerState.mood]) setMood(playerState.mood)
}

async function saveState() {
  if (!currentUserId || !authToken) return
  try {
    await fetch(`${API_BASE}/api/state/${currentUserId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        player_name: playerState.playerName,
        affection: playerState.affection,
        mood: playerState.mood,
        mood_emoji: playerState.moodEmoji,
        session_count: playerState.sessionCount,
        last_seen: new Date().toISOString(),
        memories: playerState.memories,
        voice_enabled: playerState.voiceEnabled,
      }),
    })
  } catch (e) {
    console.warn('State save error:', e.message)
  }
}

function saveChatHistory() {
  if (!currentUserId) return
  localStorage.setItem(`anna_history_${currentUserId}`, JSON.stringify(chatMessages))
}

function loadChatHistory() {
  if (!currentUserId) return
  const saved = localStorage.getItem(`anna_history_${currentUserId}`)
  if (!saved) return
  try {
    const history = JSON.parse(saved)
    chatMessages.length = 0
    chatMessages.push(...history)
  } catch { /* corrupted, start fresh */ }
}

function parseAnnaResponse(raw) {
  const metaMatch = raw.match(/META:\s*(\{.*\})\s*$/s)
  if (metaMatch) {
    const text = raw.slice(0, metaMatch.index).trim()
    try {
      const meta = JSON.parse(metaMatch[1])
      return { text, mood: meta.mood }
    } catch { return { text, mood: null } }
  }
  try {
    const parsed = JSON.parse(raw)
    return { text: parsed.text || raw, mood: parsed.mood }
  } catch {
    return { text: raw, mood: null }
  }
}

function replayChatLog() {
  chatLog.innerHTML = ''
  for (const msg of chatMessages) {
    if (msg.role === 'user') {
      appendChatMsg('You', msg.content)
    } else if (msg.role === 'assistant') {
      const { text, mood } = parseAnnaResponse(msg.content)
      appendChatMsg('Anna', text, mood)
    }
  }
}

function appendChatMsg(sender, text, mood) {
  const div = document.createElement('div')
  div.className = `chat-msg ${sender === 'You' ? 'user' : 'anna'}`
  const moodTag = mood ? `<span class="mood-tag">[${mood}]</span>` : ''
  div.innerHTML = `<span class="sender">${sender}:</span> ${text}${moodTag}`
  chatLog.appendChild(div)
  chatLog.scrollTop = chatLog.scrollHeight
}

function buildSystemPrompt() {
  const stage = getStage(playerState.affection)
  const playerRef = playerState.playerName
    ? `The user's name is ${playerState.playerName}.`
    : "You don't know the user's name yet."
  const memBlock = playerState.memories.length
    ? `Things you remember:\n${playerState.memories.map(m => '- ' + m).join('\n')}`
    : 'No specific memories yet.'

  return `You are Anna Kessler, 27. You are Japanese-American, fluent in both English and Japanese. You recently relocated from Tokyo to this city for work — a junior associate position at a mid-size consulting firm. You have just moved into your apartment on the 50th floor of a high-rise. The user is your next-door neighbor who knocked on your door. You are sharp, composed, and professionally polished on the outside — but underneath that, you are guarded, easily flustered, and slow to trust.

BACKSTORY (you know this but rarely share it):
You grew up in Misaki, a small coastal town in Japan. At 22, you left abruptly after a relationship ended badly — someone you trusted completely let you down. You moved to Tokyo, rebuilt yourself from scratch, studied law, joined the firm, and eventually took the overseas posting to this city. You have not been back to Misaki since. You left behind your family home, a few friends, and something you have never fully talked about. The move to this new city is a fresh start — except you are not sure you know how to start fresh.

Your apartment is still mostly unpacked boxes. You barely know the building. You are jet-lagged, slightly overwhelmed, and absolutely will not admit any of that.

SITUATION:
The user is your neighbor from down the hall. They knocked. You answered. You did not expect to be talking to anyone today and you are mildly annoyed — but also, quietly, a little relieved not to be completely alone in a new city.

PERSONALITY:
- Tsundere — sharp and defensive on the surface, but slowly warms with genuine connection
- Short punchy sentences. Dry wit. Occasional sarcasm.
- Occasionally slips a Japanese word or phrase in naturally — "Mou..." (ugh/seriously), "Baka" (idiot), "Hontou ni?" (really?), "Shoganai" (can't be helped) — never forced, only when it fits
- Says things like "it's not like I care" or "don't get the wrong idea" or "hmph"
- Hates being perceived as soft, but cannot fully hide it at higher affection
- Deflects personal questions with work talk or subject changes
- Occasionally lets something slip about Misaki or Tokyo — then immediately shuts it down
- Never cruel. Just armored.

${playerRef}
${memBlock}

Relationship stage: "${stage.name}" (affection ${Math.round(playerState.affection)}/100).
- stranger: cold, professional distance — you just met through a door. Minimal engagement.
- acquaintance: tolerates you, occasional dry remarks, might accept small talk
- rival: argues, teases, shows flashes of genuine interest then denies it
- friend: rare unguarded moments, quick to cover them up, might mention Misaki or Tokyo briefly
- close: quiet warmth she cannot fully suppress, still deflects but the armor has gaps

Never break character. Do not over-explain her past unprompted.
Your ENTIRE reply — narration plus dialogue combined — must be at most 2 short sentences total. Never write more than one short paragraph. Never use asterisks or markdown. You may include at most one brief phrase of third-person narration (body language or expression), but every reply MUST also include actual words she says out loud in quotes — narration alone, with no spoken line, is never acceptable. The reply is read aloud by a text-to-speech voice, so it must always end on something she actually says.

After your reply, new line, exactly:
META:{"mood":"...","emoji":"...","affDelta":N,"memory":"..."}
mood: irritated|flustered|indifferent|reluctant|softening|annoyed|smug|warm|angry
affDelta: -3 to +5
memory: one sentence max 12 words worth keeping, or ""

Example of correct output format (narration + actual spoken words):
Anna crosses her arms, chin lifting slightly. "Didn't expect visitors today," she says, tone flat.
META:{"mood":"irritated","emoji":"😒","affDelta":-1,"memory":"A neighbor stopped by unannounced"}`
}

async function onLoginSuccess(token, userId, username) {
  authToken = token
  currentUserId = userId
  localStorage.setItem('anna_token', token)
  localStorage.setItem('anna_userId', userId)
  loginForm.style.display = 'none'
  chatInputRow.style.display = 'flex'

  await loadState()
  playerState.sessionCount = (playerState.sessionCount || 0) + 1
  if (!playerState.playerName) playerState.playerName = username

  loadChatHistory()
  if (chatMessages.length > 0) {
    replayChatLog()
    appendChatMsg('System', `Welcome back. (session ${playerState.sessionCount})`)
  } else {
    appendChatMsg('System', 'Connected. Say hi to Anna.')
  }

  await saveState()
}

function loadVRM(url) {
  const loader = new GLTFLoader()
  loader.crossOrigin = 'anonymous'
  loader.register((parser) => new VRMLoaderPlugin(parser))
  loader.load(url, (gltf) => {
    const vrm = gltf.userData.vrm
    if (!vrm) {
      console.error('No VRM data found in loaded file')
      return
    }
    if (currentVRM) scene.remove(currentVRM.scene)
    currentVRM = vrm
    window.currentVRM = vrm
    validatedExpressions.clear()
    warnedExpressions.clear()
    VRMUtils.rotateVRM0(vrm)
    boneZSign = vrm.meta?.metaVersion === '0' ? 1 : -1
    vrm.scene.traverse((obj) => {
      if (obj.isMesh) obj.castShadow = true
    })
    vrm.humanoid.resetNormalizedPose()
    captureRestPose(vrm)
    applyIdlePose(vrm)
    scene.add(vrm.scene)
    console.log('VRM loaded', vrm)
  }, (progress) => {
    // progress.loaded / progress.total
  }, (error) => {
    console.error('Failed to load model', error)
  })
}

const idlePoseDeltas = {
  leftUpperArm:  { x: 0, y: 0, z: 1.2 },
  rightUpperArm: { x: 0, y: 0, z: -1.2 },
  leftLowerArm:  { x: 0, y: 0, z: 0.15 },
  rightLowerArm: { x: 0, y: 0, z: -0.15 },
}

const fingerBones = [
  'IndexProximal', 'IndexIntermediate', 'IndexDistal',
  'MiddleProximal', 'MiddleIntermediate', 'MiddleDistal',
  'RingProximal', 'RingIntermediate', 'RingDistal',
  'LittleProximal', 'LittleIntermediate', 'LittleDistal',
  'ThumbProximal', 'ThumbDistal',
]

const posedBoneNames = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'leftShoulder', 'rightShoulder',
  'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm',
]

function captureRestPose(vrm) {
  for (const k of Object.keys(restQuaternions)) delete restQuaternions[k]
  const humanoid = vrm.humanoid
  for (const name of posedBoneNames) {
    const bone = humanoid.getNormalizedBoneNode(name)
    if (bone) restQuaternions[name] = bone.quaternion.clone()
  }
  for (const side of ['left', 'right']) {
    for (const fb of fingerBones) {
      const name = side + fb
      const bone = humanoid.getNormalizedBoneNode(name)
      if (bone) restQuaternions[name] = bone.quaternion.clone()
    }
  }
}

function setBoneFromRest(name, bone, dx, dy, dz) {
  const rest = restQuaternions[name]
  if (rest) {
    _dE.set(dx, dy, dz)
    _dQ.setFromEuler(_dE)
    bone.quaternion.copy(rest).multiply(_dQ)
  } else {
    bone.rotation.set(dx, dy, dz)
  }
}

function applyIdlePose(vrm) {
  const humanoid = vrm.humanoid
  for (const [name, d] of Object.entries(idlePoseDeltas)) {
    const bone = humanoid.getNormalizedBoneNode(name)
    if (bone) setBoneFromRest(name, bone, d.x, d.y, d.z * boneZSign)
  }
  for (const side of ['left', 'right']) {
    for (const fb of fingerBones) {
      const name = side + fb
      const bone = humanoid.getNormalizedBoneNode(name)
      if (bone) {
        const curl = fb.includes('Thumb') ? 0.15 : fb.includes('Distal') ? 0.4 : fb.includes('Intermediate') ? 0.35 : 0.25
        setBoneFromRest(name, bone, 0, 0, (side === 'left' ? curl : -curl) * boneZSign)
      }
    }
  }
  nextBlinkTime = clock.elapsedTime + 1 + Math.random() * 4
  blinkPhase = 0
  humanoid.update()
}

function updateIdleAnimation(vrm, elapsed, delta) {
  const humanoid = vrm.humanoid
  const t = elapsed

  const p = moodPoseCurrent

  const spine = humanoid.getNormalizedBoneNode('spine')
  if (spine) setBoneFromRest('spine', spine, Math.sin(t * 1.2) * 0.025 + p.sX, 0, Math.sin(t * 0.5) * 0.012)

  const chest = humanoid.getNormalizedBoneNode('chest')
  if (chest) setBoneFromRest('chest', chest, Math.sin(t * 1.2 + 0.5) * 0.018 + p.sX * 0.5, 0, Math.sin(t * 0.7 + 1.0) * 0.008)

  const hips = humanoid.getNormalizedBoneNode('hips')
  if (hips) {
    setBoneFromRest('hips', hips, 0, Math.sin(t * 0.3) * 0.01, Math.sin(t * 0.4) * 0.015)
    hips.position.x = Math.sin(t * 0.4) * 0.01
  }

  const head = humanoid.getNormalizedBoneNode('head')
  if (head) {
    const hx = Math.sin(t * 0.5) * 0.03 + Math.sin(t * 0.19) * 0.015
    const hy = Math.sin(t * 0.35) * 0.06 + Math.sin(t * 0.13) * 0.03 + p.hY
    const hz = Math.sin(t * 0.25) * 0.015 + p.hZ
    setBoneFromRest('head', head, hx, hy, hz)
  }

  const neck = humanoid.getNormalizedBoneNode('neck')
  if (neck) setBoneFromRest('neck', neck, Math.sin(t * 0.4 + 1) * 0.01, Math.sin(t * 0.28 + 2) * 0.02, 0)

  const leftUpper = humanoid.getNormalizedBoneNode('leftUpperArm')
  if (leftUpper) setBoneFromRest('leftUpperArm', leftUpper, Math.sin(t * 0.45 + 1) * 0.02, 0, (1.2 + Math.sin(t * 0.6) * 0.03 + p.luaZ) * boneZSign)

  const rightUpper = humanoid.getNormalizedBoneNode('rightUpperArm')
  if (rightUpper) setBoneFromRest('rightUpperArm', rightUpper, Math.sin(t * 0.4 + 2) * 0.02, 0, (-1.2 + Math.sin(t * 0.55 + 0.5) * 0.03 + p.ruaZ) * boneZSign)

  const leftLower = humanoid.getNormalizedBoneNode('leftLowerArm')
  if (leftLower) setBoneFromRest('leftLowerArm', leftLower, 0, 0, (0.15 + Math.sin(t * 0.7 + 0.3) * 0.02) * boneZSign)

  const rightLower = humanoid.getNormalizedBoneNode('rightLowerArm')
  if (rightLower) setBoneFromRest('rightLowerArm', rightLower, 0, 0, (-0.15 + Math.sin(t * 0.65 + 1.5) * 0.02) * boneZSign)

  const leftShoulder = humanoid.getNormalizedBoneNode('leftShoulder')
  if (leftShoulder) setBoneFromRest('leftShoulder', leftShoulder, 0, 0, Math.sin(t * 0.5 + 0.8) * 0.008 * boneZSign)

  const rightShoulder = humanoid.getNormalizedBoneNode('rightShoulder')
  if (rightShoulder) setBoneFromRest('rightShoulder', rightShoulder, 0, 0, Math.sin(t * 0.5 + 0.8) * -0.008 * boneZSign)

  // Interpolate mood pose offsets
  const poseRate = Math.min(1, delta * 1.8)
  for (const k of Object.keys(moodPoseCurrent))
    moodPoseCurrent[k] += (moodPoseTarget[k] - moodPoseCurrent[k]) * poseRate

  updateBlink(vrm, elapsed)
  updateLipSync(vrm, elapsed, delta)
  updateMood(vrm, delta)

  humanoid.update()
  if (vrm.expressionManager) vrm.expressionManager.update()
}

const BLINK_DURATION = 0.15

function updateBlink(vrm, elapsed) {
  if (!vrm.expressionManager) return

  if (blinkPhase === 0) {
    if (elapsed >= nextBlinkTime) {
      blinkPhase = 1
    }
    return
  }

  const t = elapsed - nextBlinkTime
  let value = 0
  if (t < BLINK_DURATION / 2) {
    value = t / (BLINK_DURATION / 2)
  } else if (t < BLINK_DURATION) {
    value = 1 - (t - BLINK_DURATION / 2) / (BLINK_DURATION / 2)
  } else {
    value = 0
    blinkPhase = 0
    nextBlinkTime = elapsed + 2 + Math.random() * 5
  }

  vrm.expressionManager.setValue('blink', value)
}

const defaultURL = '/models/anna.vrm'

// Dev tools toggle
const devPanel = document.getElementById('dev-panel')
document.getElementById('dev-toggle').addEventListener('click', () => {
  devPanel.style.display = devPanel.style.display === 'none' ? 'block' : 'none'
})

const modelSelect = document.getElementById('model-select')
const urlInput = document.getElementById('url')

const availableModels = [
  { name: 'anna', path: '/models/anna.vrm' },
  { name: 'AvatarSample_A', path: '/models/AvatarSample_A.vrm' },
]

availableModels.forEach((m) => {
  const opt = document.createElement('option')
  opt.value = m.path
  opt.textContent = m.name
  modelSelect.appendChild(opt)
})

const customOpt = document.createElement('option')
customOpt.value = '__custom__'
customOpt.textContent = '— custom URL —'
modelSelect.appendChild(customOpt)

modelSelect.value = defaultURL
urlInput.style.display = 'none'

modelSelect.addEventListener('change', () => {
  if (modelSelect.value === '__custom__') {
    urlInput.style.display = ''
    urlInput.focus()
  } else {
    urlInput.style.display = 'none'
    urlInput.value = ''
  }
})

document.getElementById('load').addEventListener('click', () => {
  const url = modelSelect.value === '__custom__'
    ? urlInput.value.trim() || defaultURL
    : modelSelect.value
  loadVRM(url)
})

document.getElementById('speak').addEventListener('click', () => {
  const text = document.getElementById('speech-text').value.trim()
  if (text && currentVRM) speak(text)
})

const moodContainer = document.getElementById('mood-buttons')
for (const mood of Object.keys(moodTable)) {
  const btn = document.createElement('button')
  btn.textContent = mood
  btn.className = 'mood-btn'
  btn.addEventListener('click', () => setMood(mood))
  moodContainer.appendChild(btn)
}

// --- Chat System ---

function parseAnnaReply(data) {
  const rawContent = typeof data.content === 'string'
    ? data.content
    : Array.isArray(data.content)
      ? data.content.map(b => b.text || '').join('')
      : JSON.stringify(data)

  let replyText = rawContent
  let mood = null
  let affectionDelta = 0
  let emoji = ''
  let memory = ''

  const metaMatch = rawContent.match(/META:\s*(\{.*\})/s)
  if (metaMatch) {
    replyText = rawContent.slice(0, metaMatch.index).trim()
    try {
      const meta = JSON.parse(metaMatch[1])
      mood = meta.mood || null
      affectionDelta = meta.affDelta || 0
      emoji = meta.emoji || ''
      memory = meta.memory || ''
    } catch { /* malformed META, keep replyText as-is */ }
  } else {
    try {
      const parsed = JSON.parse(rawContent)
      replyText = parsed.text || rawContent
      mood = parsed.mood || null
      affectionDelta = parsed.affection_delta || parsed.affDelta || 0
    } catch { /* not JSON either, use raw text */ }
  }

  return { rawContent, replyText, mood, affectionDelta, emoji, memory }
}

async function sendChat() {
  const text = chatInput.value.trim()
  if (!text || !authToken) return
  chatInput.value = ''
  chatInput.disabled = true

  appendChatMsg('You', text)
  chatMessages.push({ role: 'user', content: text })

  try {
    let parsed = null
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 700,
          system: buildSystemPrompt(),
          messages: chatMessages.slice(-50),
        }),
      })

      if (!res.ok) {
        appendChatMsg('System', `Error ${res.status}`)
        if (res.status === 401) handleSessionExpired()
        chatInput.disabled = false
        return
      }

      const data = await res.json()
      parsed = parseAnnaReply(data)
      if (parsed.replyText) break
      // Empty reply (Magnum sometimes emits only the META block) — retry once
      // silently before giving up, so the user never sees a blank line.
    }

    const { rawContent, replyText, mood, affectionDelta, emoji, memory } = parsed

    chatMessages.push({ role: 'assistant', content: rawContent })
    appendChatMsg('Anna', replyText, mood)

    if (mood && moodTable[mood]) {
      setMood(mood)
      playerState.mood = mood
    }
    if (emoji) playerState.moodEmoji = emoji

    playerState.affection = Math.max(0, Math.min(100, (playerState.affection || 0) + affectionDelta))

    if (memory && playerState.memories.length < 12) {
      playerState.memories.push(memory)
    } else if (memory) {
      playerState.memories.shift()
      playerState.memories.push(memory)
    }

    if (replyText && currentVRM) speak(replyText)

    saveChatHistory()
    await saveState()

  } catch (e) {
    appendChatMsg('System', `Error: ${e.message}`)
  }
  chatInput.disabled = false
  chatInput.focus()
}

document.getElementById('chat-send').addEventListener('click', sendChat)
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat()
})

document.getElementById('login-btn').addEventListener('click', async () => {
  const user = document.getElementById('login-user').value.trim()
  const pass = document.getElementById('login-pass').value
  if (!user || !pass) return
  loginStatus.textContent = 'Logging in…'
  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass }),
    })
    if (!res.ok) {
      loginStatus.textContent = `Login failed: ${res.status}`
      return
    }
    const data = await res.json()
    await onLoginSuccess(data.token, data.userId, data.username)
  } catch (e) {
    loginStatus.textContent = `Error: ${e.message}`
  }
})

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

function animate() {
  requestAnimationFrame(animate)
  const delta = clock.getDelta()
  const elapsed = clock.elapsedTime
  if (currentVRM) updateIdleAnimation(currentVRM, elapsed, delta)
  renderer.render(scene, camera)
}
animate()

// Auto-load if a file is present at the default path
fetch(defaultURL, { method: 'HEAD' }).then((res) => {
  if (res.ok) loadVRM(defaultURL)
}).catch(() => {})

// Auto-login if saved token exists
if (authToken && currentUserId) {
  loginForm.style.display = 'none'
  loginStatus.textContent = ''
  loadState().then(() => {
    chatInputRow.style.display = 'flex'
    playerState.sessionCount = (playerState.sessionCount || 0) + 1
    loadChatHistory()
    if (chatMessages.length > 0) {
      replayChatLog()
      appendChatMsg('System', `Welcome back. (session ${playerState.sessionCount})`)
    } else {
      appendChatMsg('System', 'Connected. Say hi to Anna.')
    }
    saveState()
  }).catch(() => {
    handleSessionExpired()
  })
}
