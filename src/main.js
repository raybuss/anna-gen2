import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin } from '@pixiv/three-vrm'
import { buildApartment } from './apartment.js'

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

// --- Speech & Lip Sync ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
const analyser = audioCtx.createAnalyser()
analyser.fftSize = 256
const frequencyData = new Uint8Array(analyser.frequencyBinCount)

let isSpeaking = false
let useAnalyser = false
let mouthValue = 0

async function speak(text) {
  audioCtx.resume()
  if (!authToken) {
    // Fallback to browser TTS when not logged in
    window.speechSynthesis.cancel()
    isSpeaking = true
    useAnalyser = false
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onend = () => { isSpeaking = false }
    utterance.onerror = () => { isSpeaking = false }
    window.speechSynthesis.speak(utterance)
    return
  }
  try {
    const res = await fetch(`${API_BASE}/api/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) {
      console.warn(`Speech API error ${res.status}, falling back to browser TTS`)
      window.speechSynthesis.cancel()
      isSpeaking = true
      useAnalyser = false
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.onend = () => { isSpeaking = false }
      utterance.onerror = () => { isSpeaking = false }
      window.speechSynthesis.speak(utterance)
      return
    }
    const audio = new Audio(URL.createObjectURL(await res.blob()))
    const source = audioCtx.createMediaElementSource(audio)
    source.connect(analyser)
    analyser.connect(audioCtx.destination)
    useAnalyser = true
    audio.onplay = () => { isSpeaking = true }
    audio.onended = () => { isSpeaking = false }
    audio.play()
  } catch (e) {
    console.warn('Speech API failed, falling back to browser TTS:', e.message)
    window.speechSynthesis.cancel()
    isSpeaking = true
    useAnalyser = false
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onend = () => { isSpeaking = false }
    utterance.onerror = () => { isSpeaking = false }
    window.speechSynthesis.speak(utterance)
  }
}

function getSpeechAmplitude(elapsed) {
  if (!isSpeaking) return 0

  if (useAnalyser) {
    analyser.getByteFrequencyData(frequencyData)
    let sum = 0
    for (let i = 0; i < 8; i++) sum += frequencyData[i]
    return sum / 8 / 255
  }

  // Simulated speech-like amplitude for SpeechSynthesis stub
  const t = elapsed
  const wave = Math.sin(t * 14.5) * 0.35
    + Math.sin(t * 22.7) * 0.25
    + Math.sin(t * 8.3) * 0.4
  return Math.max(0, Math.min(1, wave + 0.35))
}

function updateLipSync(vrm, elapsed, delta) {
  const target = getSpeechAmplitude(elapsed)
  const smoothing = isSpeaking ? 20 : 8
  mouthValue += (target - mouthValue) * Math.min(1, delta * smoothing)
  if (Math.abs(mouthValue) < 0.001) mouthValue = 0
  if (vrm.expressionManager) vrm.expressionManager.setValue('aa', mouthValue)
}

// --- Mood System ---
const moodTable = {
  irritated:   { angry: 0.3 },
  flustered:   { Surprised: 0.4, happy: 0.15 },
  indifferent: { neutral: 1.0, relaxed: 0.2 },
  reluctant:   { angry: 0.15, relaxed: 0.1 },
  softening:   { happy: 0.25, relaxed: 0.15 },
  annoyed:     { angry: 0.5 },
  smug:        { happy: 0.3, angry: 0.1 },
  warm:        { happy: 0.6, relaxed: 0.2 },
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
  console.log(`Mood set: ${moodName}`)
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
    vrm.scene.rotation.y = Math.PI
    vrm.scene.traverse((obj) => {
      if (obj.isMesh) obj.castShadow = true
    })
    applyIdlePose(vrm)
    scene.add(vrm.scene)
    console.log('VRM loaded', vrm)
  }, (progress) => {
    // progress.loaded / progress.total
  }, (error) => {
    console.error('Failed to load model', error)
  })
}

const idlePose = {
  leftUpperArm: { z: 1.2 },
  rightUpperArm: { z: -1.2 },
  leftLowerArm: { z: 0.15 },
  rightLowerArm: { z: -0.15 },
}

const fingerBones = [
  'IndexProximal', 'IndexIntermediate', 'IndexDistal',
  'MiddleProximal', 'MiddleIntermediate', 'MiddleDistal',
  'RingProximal', 'RingIntermediate', 'RingDistal',
  'LittleProximal', 'LittleIntermediate', 'LittleDistal',
  'ThumbProximal', 'ThumbDistal',
]

function applyIdlePose(vrm) {
  const humanoid = vrm.humanoid
  for (const [name, rot] of Object.entries(idlePose)) {
    const bone = humanoid.getNormalizedBoneNode(name)
    if (bone && rot.z !== undefined) bone.rotation.z = rot.z
  }
  for (const side of ['left', 'right']) {
    for (const fb of fingerBones) {
      const bone = humanoid.getNormalizedBoneNode(side + fb)
      if (bone) {
        const curl = fb.includes('Thumb') ? 0.15 : fb.includes('Distal') ? 0.4 : fb.includes('Intermediate') ? 0.35 : 0.25
        bone.rotation.z = side === 'left' ? curl : -curl
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

  // Breathing — spine and chest expand/contract
  const spine = humanoid.getNormalizedBoneNode('spine')
  if (spine) {
    spine.rotation.x = Math.sin(t * 1.2) * 0.025
    spine.rotation.z = Math.sin(t * 0.5) * 0.012
  }

  const chest = humanoid.getNormalizedBoneNode('chest')
  if (chest) {
    chest.rotation.x = Math.sin(t * 1.2 + 0.5) * 0.018
    chest.rotation.z = Math.sin(t * 0.7 + 1.0) * 0.008
  }

  // Weight shift — hips sway side to side
  const hips = humanoid.getNormalizedBoneNode('hips')
  if (hips) {
    hips.rotation.z = Math.sin(t * 0.4) * 0.015
    hips.rotation.y = Math.sin(t * 0.3) * 0.01
    hips.position.x = Math.sin(t * 0.4) * 0.01
  }

  // Head — natural look-around with varied speeds
  const head = humanoid.getNormalizedBoneNode('head')
  if (head) {
    head.rotation.y = Math.sin(t * 0.35) * 0.06 + Math.sin(t * 0.13) * 0.03
    head.rotation.x = Math.sin(t * 0.5) * 0.03 + Math.sin(t * 0.19) * 0.015
    head.rotation.z = Math.sin(t * 0.25) * 0.015
  }

  // Neck — subtle independent layer
  const neck = humanoid.getNormalizedBoneNode('neck')
  if (neck) {
    neck.rotation.y = Math.sin(t * 0.28 + 2) * 0.02
    neck.rotation.x = Math.sin(t * 0.4 + 1) * 0.01
  }

  // Arms — gentle sway on top of idle pose
  const leftUpper = humanoid.getNormalizedBoneNode('leftUpperArm')
  const rightUpper = humanoid.getNormalizedBoneNode('rightUpperArm')
  if (leftUpper) {
    leftUpper.rotation.z = 1.2 + Math.sin(t * 0.6) * 0.03
    leftUpper.rotation.x = Math.sin(t * 0.45 + 1) * 0.02
  }
  if (rightUpper) {
    rightUpper.rotation.z = -1.2 + Math.sin(t * 0.55 + 0.5) * 0.03
    rightUpper.rotation.x = Math.sin(t * 0.4 + 2) * 0.02
  }

  const leftLower = humanoid.getNormalizedBoneNode('leftLowerArm')
  const rightLower = humanoid.getNormalizedBoneNode('rightLowerArm')
  if (leftLower) leftLower.rotation.z = 0.15 + Math.sin(t * 0.7 + 0.3) * 0.02
  if (rightLower) rightLower.rotation.z = -0.15 + Math.sin(t * 0.65 + 1.5) * 0.02

  // Shoulders — micro shrug
  const leftShoulder = humanoid.getNormalizedBoneNode('leftShoulder')
  const rightShoulder = humanoid.getNormalizedBoneNode('rightShoulder')
  if (leftShoulder) leftShoulder.rotation.z = Math.sin(t * 0.5 + 0.8) * 0.008
  if (rightShoulder) rightShoulder.rotation.z = Math.sin(t * 0.5 + 0.8) * -0.008

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

const defaultURL = '/models/AvatarSample_A.vrm'

// Dev tools toggle
const devPanel = document.getElementById('dev-panel')
document.getElementById('dev-toggle').addEventListener('click', () => {
  devPanel.style.display = devPanel.style.display === 'none' ? 'block' : 'none'
})

document.getElementById('url').value = defaultURL
document.getElementById('load').addEventListener('click', () => {
  const url = document.getElementById('url').value.trim() || defaultURL
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
const API_BASE = '' // proxied via vite.config.js in dev; set to 'https://anna.bytor.co' in production
let authToken = null
const chatMessages = []

const SYSTEM_PROMPT = `You are Anna, a young woman who just moved into a high-rise city apartment. You're getting settled in. You have a dry wit and warm personality underneath a slightly guarded exterior.

Respond with a JSON object containing:
- "text": your spoken reply (1-3 sentences, conversational)
- "mood": one of: irritated, flustered, indifferent, reluctant, softening, annoyed, smug, warm
- "affection_delta": a number from -2 to +2 indicating how this interaction changed your feelings

Example response:
{"text": "Oh, you're here already? I haven't even finished unpacking.", "mood": "reluctant", "affection_delta": 0}

Always respond with valid JSON only, no markdown or extra text.`

const chatLog = document.getElementById('chat-log')
const chatInputRow = document.getElementById('chat-input-row')
const chatInput = document.getElementById('chat-input')
const loginStatus = document.getElementById('login-status')

function appendChatMsg(sender, text, mood) {
  const div = document.createElement('div')
  div.className = `chat-msg ${sender === 'You' ? 'user' : 'anna'}`
  const moodTag = mood ? `<span class="mood-tag">[${mood}]</span>` : ''
  div.innerHTML = `<span class="sender">${sender}:</span> ${text}${moodTag}`
  chatLog.appendChild(div)
  chatLog.scrollTop = chatLog.scrollHeight
}

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
      const err = await res.text()
      loginStatus.textContent = `Login failed: ${res.status}`
      console.warn('Login failed:', err)
      return
    }
    const data = await res.json()
    authToken = data.token
    loginStatus.textContent = `Logged in as ${user}`
    document.getElementById('login-form').style.display = 'none'
    chatInputRow.style.display = 'flex'
    appendChatMsg('System', 'Connected. Say hi to Anna.')
  } catch (e) {
    loginStatus.textContent = `Error: ${e.message}`
    if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
      console.error('CORS or network error — the anna-web backend may need CORS headers for this origin')
    }
  }
})

async function sendChat() {
  const text = chatInput.value.trim()
  if (!text || !authToken) return
  chatInput.value = ''
  chatInput.disabled = true

  appendChatMsg('You', text)
  chatMessages.push({ role: 'user', content: text })

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 350,
        system: SYSTEM_PROMPT,
        messages: chatMessages,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      appendChatMsg('System', `Error ${res.status}: ${err}`)
      if (res.status === 401) {
        loginStatus.textContent = 'Session expired'
        document.getElementById('login-form').style.display = 'flex'
        chatInputRow.style.display = 'none'
        authToken = null
      }
      chatInput.disabled = false
      return
    }

    const data = await res.json()
    const rawContent = typeof data.content === 'string'
      ? data.content
      : Array.isArray(data.content)
        ? data.content.map(b => b.text || '').join('')
        : JSON.stringify(data)

    let replyText = rawContent
    let mood = null
    let affectionDelta = 0

    try {
      const parsed = JSON.parse(rawContent)
      replyText = parsed.text || rawContent
      mood = parsed.mood || null
      affectionDelta = parsed.affection_delta || 0
    } catch {
      // Response wasn't JSON — use raw text
    }

    chatMessages.push({ role: 'assistant', content: rawContent })
    appendChatMsg('Anna', replyText, mood)

    if (mood && moodTable[mood]) {
      setMood(mood)
    } else if (mood) {
      console.warn(`Unknown mood from API: "${mood}"`)
    }

    if (replyText && currentVRM) speak(replyText)

  } catch (e) {
    appendChatMsg('System', `Error: ${e.message}`)
    if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
      console.error('CORS or network error on /api/chat — anna-web backend may need CORS headers for this origin')
    }
  }
  chatInput.disabled = false
  chatInput.focus()
}

document.getElementById('chat-send').addEventListener('click', sendChat)
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat()
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
