import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin } from '@pixiv/three-vrm'

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

// Procedural city skyline backdrop behind windows
function buildCityBackdrop() {
  const canvas = document.createElement('canvas')
  const w = 2048, h = 1024
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  // Dark sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h)
  skyGrad.addColorStop(0, '#0a0a1a')
  skyGrad.addColorStop(0.3, '#0f1020')
  skyGrad.addColorStop(0.7, '#151828')
  skyGrad.addColorStop(1, '#1a1520')
  ctx.fillStyle = skyGrad
  ctx.fillRect(0, 0, w, h)

  // Buildings — varying heights, eye-level is around 60% from top
  const horizon = h * 0.6
  const buildings = []
  let x = 0
  while (x < w) {
    const bw = 15 + Math.random() * 60
    const tall = Math.random() > 0.7
    const bh = tall ? 150 + Math.random() * 350 : 40 + Math.random() * 200
    const top = horizon - bh
    buildings.push({ x, w: bw, top, h: bh })
    x += bw + Math.random() * 8
  }

  for (const b of buildings) {
    // Building silhouette
    const shade = 10 + Math.floor(Math.random() * 20)
    ctx.fillStyle = `rgb(${shade},${shade},${shade + 5})`
    ctx.fillRect(b.x, b.top, b.w, b.h + (h - horizon))

    // Lit windows
    const winW = 3, winH = 2, gapX = 6, gapY = 5
    for (let wy = b.top + 4; wy < horizon + b.h * 0.3; wy += gapY) {
      for (let wx = b.x + 3; wx < b.x + b.w - 3; wx += gapX) {
        if (Math.random() > 0.35) {
          const warm = Math.random() > 0.3
          if (warm) {
            const brightness = 150 + Math.floor(Math.random() * 105)
            ctx.fillStyle = `rgb(${brightness},${Math.floor(brightness * 0.85)},${Math.floor(brightness * 0.5)})`
          } else {
            const brightness = 120 + Math.floor(Math.random() * 80)
            ctx.fillStyle = `rgb(${Math.floor(brightness * 0.7)},${Math.floor(brightness * 0.8)},${brightness})`
          }
          ctx.fillRect(wx, wy, winW, winH)
        }
      }
    }
  }

  // Ground-level lights / street glow
  const streetGrad = ctx.createLinearGradient(0, horizon, 0, h)
  streetGrad.addColorStop(0, 'rgba(255,180,80,0.05)')
  streetGrad.addColorStop(0.3, 'rgba(255,150,50,0.08)')
  streetGrad.addColorStop(1, 'rgba(255,100,30,0.03)')
  ctx.fillStyle = streetGrad
  ctx.fillRect(0, horizon, w, h - horizon)

  // Scattered street / car lights at bottom
  for (let i = 0; i < 500; i++) {
    const sx = Math.random() * w
    const sy = horizon + Math.random() * (h - horizon)
    const colors = ['#ffaa44', '#ff6622', '#ffffff', '#88aaff']
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)]
    ctx.globalAlpha = 0.2 + Math.random() * 0.6
    ctx.fillRect(sx, sy, 1 + Math.random() * 2, 1)
  }
  ctx.globalAlpha = 1

  return new THREE.CanvasTexture(canvas)
}

const cityBackdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 40),
  new THREE.MeshBasicMaterial({ map: buildCityBackdrop() })
)
cityBackdrop.rotation.y = -Math.PI / 2
cityBackdrop.position.set(15, 4, -2)
scene.add(cityBackdrop)

const hemi = new THREE.HemisphereLight(0x223344, 0x111122, 0.3)
scene.add(hemi)

const ambient = new THREE.AmbientLight(0x334466, 0.15)
scene.add(ambient)

// Key light — warm interior from ceiling
const dir = new THREE.DirectionalLight(0xffd9a0, 0.8)
dir.position.set(-1, 4, 3)
dir.castShadow = true
dir.shadow.mapSize.set(1024, 1024)
dir.shadow.camera.near = 0.5
dir.shadow.camera.far = 12
dir.shadow.camera.left = -3
dir.shadow.camera.right = 3
dir.shadow.camera.top = 4
dir.shadow.camera.bottom = -1
scene.add(dir)

// City glow from windows on the right
const cityFill = new THREE.DirectionalLight(0x6688bb, 0.4)
cityFill.position.set(5, 2, 0)
scene.add(cityFill)

// --- Apartment (50th floor) ---
const roomW = 8, roomD = 10, roomH = 3.2
const roomZ0 = -roomD / 2 + 3
const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d8, roughness: 0.95 })
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.85, roughness: 0.2 })

// Floor — dark hardwood
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(roomW, roomD),
  new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.6, metalness: 0.05 })
)
floor.rotation.x = -Math.PI / 2
floor.position.set(0, 0, roomZ0)
floor.receiveShadow = true
scene.add(floor)

// Ceiling
const ceiling = new THREE.Mesh(
  new THREE.PlaneGeometry(roomW, roomD),
  new THREE.MeshStandardMaterial({ color: 0xf0ece8, roughness: 1.0 })
)
ceiling.rotation.x = Math.PI / 2
ceiling.position.set(0, roomH, roomZ0)
scene.add(ceiling)

// Back wall (solid, behind avatar)
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomH), wallMat)
backWall.position.set(0, roomH / 2, roomZ0 - roomD / 2)
backWall.receiveShadow = true
scene.add(backWall)

// Left wall (solid)
const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(roomD, roomH), wallMat)
leftWall.rotation.y = Math.PI / 2
leftWall.position.set(-roomW / 2, roomH / 2, roomZ0)
leftWall.receiveShadow = true
scene.add(leftWall)

// Front wall (behind camera, apartment entrance)
const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomH), wallMat)
frontWall.rotation.y = Math.PI
frontWall.position.set(0, roomH / 2, roomZ0 + roomD / 2)
scene.add(frontWall)

// Right wall — floor-to-ceiling windows (city view to the right)
const rightX = roomW / 2
const mullionW = 0.06
const windowPanes = 4
const paneD = roomD / windowPanes

for (let i = 0; i <= windowPanes; i++) {
  const z = roomZ0 - roomD / 2 + paneD * i
  const mullion = new THREE.Mesh(new THREE.BoxGeometry(mullionW, roomH, mullionW), darkMetal)
  mullion.position.set(rightX, roomH / 2, z)
  scene.add(mullion)
}
const topRail = new THREE.Mesh(new THREE.BoxGeometry(mullionW, mullionW, roomD), darkMetal)
topRail.position.set(rightX, roomH, roomZ0)
scene.add(topRail)
const midRail = new THREE.Mesh(new THREE.BoxGeometry(mullionW, mullionW, roomD), darkMetal)
midRail.position.set(rightX, roomH * 0.6, roomZ0)
scene.add(midRail)

const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xaaccdd, transmission: 0.92, thickness: 0.05,
  roughness: 0.05, metalness: 0, ior: 1.5, opacity: 0.15, transparent: true,
})
const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(roomD, roomH), glassMat)
glassPane.rotation.y = -Math.PI / 2
glassPane.position.set(rightX - 0.01, roomH / 2, roomZ0)
scene.add(glassPane)

// --- Furniture ---

// Sofa (against back wall, facing camera)
const sofaGroup = new THREE.Group()
const sofaFabric = new THREE.MeshStandardMaterial({ color: 0x3a3a4a, roughness: 0.85 })
const sofaW = 2.0, sofaD = 0.8, sofaSeatH = 0.42, sofaBackH = 0.35

const sofaSeat = new THREE.Mesh(new THREE.BoxGeometry(sofaW, sofaSeatH, sofaD), sofaFabric)
sofaSeat.position.set(0, sofaSeatH / 2, 0)
sofaSeat.castShadow = true
sofaSeat.receiveShadow = true
sofaGroup.add(sofaSeat)

const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(sofaW, sofaBackH, 0.15), sofaFabric)
sofaBack.position.set(0, sofaSeatH + sofaBackH / 2, -sofaD / 2 + 0.075)
sofaBack.castShadow = true
sofaGroup.add(sofaBack)

for (const side of [-1, 1]) {
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, sofaBackH * 0.7, sofaD), sofaFabric)
  arm.position.set(side * (sofaW / 2 - 0.06), sofaSeatH + sofaBackH * 0.35, 0)
  arm.castShadow = true
  sofaGroup.add(arm)
}

for (const cx of [-0.45, 0.45]) {
  const cushion = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.12, 0.65),
    new THREE.MeshStandardMaterial({ color: 0x444455, roughness: 0.9 })
  )
  cushion.position.set(cx, sofaSeatH + 0.06, 0.03)
  sofaGroup.add(cushion)
}

sofaGroup.position.set(-2.0, 0, -4.0)
scene.add(sofaGroup)

// Coffee table (in front of sofa)
const tableGroup = new THREE.Group()
const tableLegMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.3 })
const tableTop = new THREE.Mesh(
  new THREE.BoxGeometry(1.0, 0.04, 0.55),
  new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.1 })
)
tableTop.position.y = 0.4
tableTop.castShadow = true
tableTop.receiveShadow = true
tableGroup.add(tableTop)

for (const [lx, lz] of [[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.22], [0.42, 0.22]]) {
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 8), tableLegMat)
  leg.position.set(lx, 0.2, lz)
  tableGroup.add(leg)
}

tableGroup.position.set(-2.0, 0, -2.8)
scene.add(tableGroup)

// Floor lamp (right side)
const lampGroup = new THREE.Group()
const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0xc0a070, metalness: 0.6, roughness: 0.4 })
const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.7, 8), lampPoleMat)
pole.position.y = 0.85
lampGroup.add(pole)

const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.03, 16), lampPoleMat)
base.position.y = 0.015
lampGroup.add(base)

const shade = new THREE.Mesh(
  new THREE.CylinderGeometry(0.12, 0.22, 0.3, 16, 1, true),
  new THREE.MeshStandardMaterial({ color: 0xf5e6d0, roughness: 0.9, side: THREE.DoubleSide })
)
shade.position.y = 1.85
lampGroup.add(shade)

const bulb = new THREE.PointLight(0xffe0b0, 1.5, 6, 1.5)
bulb.position.y = 1.8
bulb.castShadow = true
lampGroup.add(bulb)

lampGroup.position.set(-3.2, 0, -2.0)
lampGroup.castShadow = true
scene.add(lampGroup)

// Area rug (between sofa and avatar)
const rug = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 2.5),
  new THREE.MeshStandardMaterial({ color: 0x6b5b4a, roughness: 0.95 })
)
rug.rotation.x = -Math.PI / 2
rug.position.set(-1.0, 0.005, -2.5)
scene.add(rug)

// Side table next to sofa
const sideTable = new THREE.Mesh(
  new THREE.CylinderGeometry(0.22, 0.22, 0.5, 16),
  new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.5, metalness: 0.1 })
)
sideTable.position.set(-3.2, 0.25, -4.0)
sideTable.castShadow = true
scene.add(sideTable)

// --- Moving boxes ---
const cardboard = new THREE.MeshStandardMaterial({ color: 0xb5894e, roughness: 0.9 })
const cardboardDark = new THREE.MeshStandardMaterial({ color: 0x9a7440, roughness: 0.9 })
const tape = new THREE.MeshStandardMaterial({ color: 0xc8a86e, roughness: 0.7 })

function makeClosedBox(w, h, d) {
  const group = new THREE.Group()
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cardboard)
  box.position.y = h / 2
  box.castShadow = true
  box.receiveShadow = true
  group.add(box)
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, h + 0.01, d), tape)
  strip.position.set(0, h / 2, 0)
  group.add(strip)
  return group
}

function makeOpenBox(w, h, d) {
  const group = new THREE.Group()
  const thickness = 0.03
  const botMat = cardboardDark

  const bottom = new THREE.Mesh(new THREE.BoxGeometry(w, thickness, d), botMat)
  bottom.position.y = thickness / 2
  group.add(bottom)

  const front = new THREE.Mesh(new THREE.BoxGeometry(w, h, thickness), cardboard)
  front.position.set(0, h / 2, d / 2)
  front.castShadow = true
  group.add(front)

  const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, thickness), cardboard)
  back.position.set(0, h / 2, -d / 2)
  back.castShadow = true
  group.add(back)

  const left = new THREE.Mesh(new THREE.BoxGeometry(thickness, h, d), cardboard)
  left.position.set(-w / 2, h / 2, 0)
  left.castShadow = true
  group.add(left)

  const right = new THREE.Mesh(new THREE.BoxGeometry(thickness, h, d), cardboard)
  right.position.set(w / 2, h / 2, 0)
  right.castShadow = true
  group.add(right)

  // Flaps sticking up
  const flapFront = new THREE.Mesh(new THREE.BoxGeometry(w, d * 0.4, thickness), cardboard)
  flapFront.position.set(0, h + d * 0.15, d / 2)
  flapFront.rotation.x = -0.5
  group.add(flapFront)

  const flapBack = new THREE.Mesh(new THREE.BoxGeometry(w, d * 0.4, thickness), cardboard)
  flapBack.position.set(0, h + d * 0.1, -d / 2)
  flapBack.rotation.x = 0.7
  group.add(flapBack)

  return group
}

// Stack of closed boxes against the back wall
const stack1 = makeClosedBox(0.55, 0.4, 0.45)
stack1.position.set(2.5, 0, -5.5)
stack1.rotation.y = 0.15
scene.add(stack1)

const stack2 = makeClosedBox(0.5, 0.35, 0.4)
stack2.position.set(2.5, 0.4, -5.5)
stack2.rotation.y = -0.2
scene.add(stack2)

const stack3 = makeClosedBox(0.4, 0.3, 0.35)
stack3.position.set(2.5, 0.75, -5.5)
stack3.rotation.y = 0.3
scene.add(stack3)

// Closed box near left wall
const box4 = makeClosedBox(0.6, 0.45, 0.5)
box4.position.set(-3.5, 0, -5.0)
box4.rotation.y = 0.4
scene.add(box4)

// Another closed box near the windows
const box5 = makeClosedBox(0.5, 0.5, 0.45)
box5.position.set(3.0, 0, -3.5)
box5.rotation.y = -0.1
scene.add(box5)

// Open box — unpacked, near center
const open1 = makeOpenBox(0.55, 0.3, 0.45)
open1.position.set(1.5, 0, -1.0)
open1.rotation.y = 0.6
scene.add(open1)

// Open box near the sofa
const open2 = makeOpenBox(0.5, 0.35, 0.4)
open2.position.set(-1.2, 0, -4.5)
open2.rotation.y = -0.3
scene.add(open2)

// Closed box on its side (tipped over)
const tipped = makeClosedBox(0.45, 0.4, 0.4)
tipped.position.set(1.8, 0.2, -4.8)
tipped.rotation.z = Math.PI / 2
tipped.rotation.y = 0.5
scene.add(tipped)

// Small box on the coffee table
const tableBox = makeClosedBox(0.25, 0.18, 0.2)
tableBox.position.set(-2.0, 0.42, -2.8)
tableBox.rotation.y = 0.2
scene.add(tableBox)

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
  isSpeaking = true
  useAnalyser = false
  const utterance = new SpeechSynthesisUtterance(text)
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

const defaultURL = '/models/AvatarSample_A.vrm'

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
