import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin } from '@pixiv/three-vrm'

const container = document.getElementById('viewer')

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x8fbcd4)

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000)
camera.position.set(0.0, 1.4, 2.0)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(window.devicePixelRatio)
container.appendChild(renderer.domElement)

const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0)
scene.add(hemi)
const dir = new THREE.DirectionalLight(0xffffff, 1.0)
dir.position.set(0.5, 1, 0.5)
scene.add(dir)

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

function speak(text) {
  audioCtx.resume()
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.onstart = () => { isSpeaking = true; useAnalyser = false }
  utterance.onend = () => { isSpeaking = false }
  utterance.onerror = () => { isSpeaking = false }
  window.speechSynthesis.speak(utterance)
}

/* To swap to ElevenLabs, replace speak() above with:
async function speak(text) {
  audioCtx.resume()
  const res = await fetch('/api/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceId: 'default' }),
  })
  const audio = new Audio(URL.createObjectURL(await res.blob()))
  const source = audioCtx.createMediaElementSource(audio)
  source.connect(analyser)
  analyser.connect(audioCtx.destination)
  useAnalyser = true
  audio.onplay = () => { isSpeaking = true }
  audio.onended = () => { isSpeaking = false }
  audio.play()
}
*/

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
    vrm.scene.rotation.y = Math.PI
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

function applyIdlePose(vrm) {
  const humanoid = vrm.humanoid
  for (const [name, rot] of Object.entries(idlePose)) {
    const bone = humanoid.getNormalizedBoneNode(name)
    if (bone && rot.z !== undefined) bone.rotation.z = rot.z
  }
  nextBlinkTime = clock.elapsedTime + 1 + Math.random() * 4
  blinkPhase = 0
  humanoid.update()
}

function updateIdleAnimation(vrm, elapsed, delta) {
  const humanoid = vrm.humanoid
  const spine = humanoid.getNormalizedBoneNode('spine')
  if (spine) {
    spine.rotation.x = Math.sin(elapsed * 1.2) * 0.008
    spine.rotation.z = Math.sin(elapsed * 0.7) * 0.005
  }

  const chest = humanoid.getNormalizedBoneNode('chest')
  if (chest) {
    chest.rotation.x = Math.sin(elapsed * 1.2 + 0.5) * 0.006
  }

  const head = humanoid.getNormalizedBoneNode('head')
  if (head) {
    head.rotation.y = Math.sin(elapsed * 0.3) * 0.02
    head.rotation.x = Math.sin(elapsed * 0.5) * 0.01
  }

  updateBlink(vrm, elapsed)
  updateLipSync(vrm, elapsed, delta)

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

const defaultURL = '/models/sample.vrm'

document.getElementById('url').value = defaultURL
document.getElementById('load').addEventListener('click', () => {
  const url = document.getElementById('url').value.trim() || defaultURL
  loadVRM(url)
})

document.getElementById('speak').addEventListener('click', () => {
  const text = document.getElementById('speech-text').value.trim()
  if (text && currentVRM) speak(text)
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
