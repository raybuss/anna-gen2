import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// --- Shared materials ---
const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d8, roughness: 0.95 })
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.85, roughness: 0.2 })
const hardwood = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.6, metalness: 0.05 })
const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xf0ece8, roughness: 1.0 })
const cardboard = new THREE.MeshStandardMaterial({ color: 0xb5894e, roughness: 0.9 })
const cardboardDark = new THREE.MeshStandardMaterial({ color: 0x9a7440, roughness: 0.9 })
const tape = new THREE.MeshStandardMaterial({ color: 0xc8a86e, roughness: 0.7 })
const sofaFabric = new THREE.MeshStandardMaterial({ color: 0x3a3a4a, roughness: 0.85 })
const counterTop = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.3, metalness: 0.1 })
const cabinetMat = new THREE.MeshStandardMaterial({ color: 0xd8d0c8, roughness: 0.8 })
const tileMat = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.4, metalness: 0.05 })
const porcelainMat = new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.3, metalness: 0.05 })
const bedFabric = new THREE.MeshStandardMaterial({ color: 0xe8ddd0, roughness: 0.9 })

const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xaaccdd, transmission: 0.92, thickness: 0.05,
  roughness: 0.05, metalness: 0, ior: 1.5, opacity: 0.15, transparent: true,
})

// --- Helpers ---

function makeClosedBox(w, h, d) {
  const group = new THREE.Group()
  const box = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, 0.015), cardboard)
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
  const t = 0.03

  const bot = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), cardboardDark)
  bot.position.y = t / 2; group.add(bot)

  for (const [pos, size] of [
    [[0, h / 2, d / 2], [w, h, t]],
    [[0, h / 2, -d / 2], [w, h, t]],
    [[-w / 2, h / 2, 0], [t, h, d]],
    [[w / 2, h / 2, 0], [t, h, d]],
  ]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), cardboard)
    m.position.set(...pos)
    m.castShadow = true
    group.add(m)
  }

  const flapF = new THREE.Mesh(new THREE.BoxGeometry(w, d * 0.4, t), cardboard)
  flapF.position.set(0, h + d * 0.15, d / 2)
  flapF.rotation.x = -0.5
  group.add(flapF)

  const flapB = new THREE.Mesh(new THREE.BoxGeometry(w, d * 0.4, t), cardboard)
  flapB.position.set(0, h + d * 0.1, -d / 2)
  flapB.rotation.x = 0.7
  group.add(flapB)

  return group
}

function addBox(parent, pos, rot, fn, ...args) {
  const b = fn(...args)
  b.position.set(...pos)
  if (rot) { if (rot.y) b.rotation.y = rot.y; if (rot.z) b.rotation.z = rot.z }
  parent.add(b)
}

function buildCityBackdrop() {
  const canvas = document.createElement('canvas')
  const w = 2048, h = 1024
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  const skyGrad = ctx.createLinearGradient(0, 0, 0, h)
  skyGrad.addColorStop(0, '#0a0a1a')
  skyGrad.addColorStop(0.3, '#0f1020')
  skyGrad.addColorStop(0.7, '#151828')
  skyGrad.addColorStop(1, '#1a1520')
  ctx.fillStyle = skyGrad
  ctx.fillRect(0, 0, w, h)

  const horizon = h * 0.6
  const buildings = []
  let x = 0
  while (x < w) {
    const bw = 15 + Math.random() * 60
    const tall = Math.random() > 0.7
    const bh = tall ? 150 + Math.random() * 350 : 40 + Math.random() * 200
    buildings.push({ x, w: bw, top: horizon - bh, h: bh })
    x += bw + Math.random() * 8
  }

  for (const b of buildings) {
    const shade = 10 + Math.floor(Math.random() * 20)
    ctx.fillStyle = `rgb(${shade},${shade},${shade + 5})`
    ctx.fillRect(b.x, b.top, b.w, b.h + (h - horizon))

    for (let wy = b.top + 4; wy < horizon + b.h * 0.3; wy += 5) {
      for (let wx = b.x + 3; wx < b.x + b.w - 3; wx += 6) {
        if (Math.random() > 0.35) {
          const warm = Math.random() > 0.3
          const br = warm ? 150 + Math.floor(Math.random() * 105) : 120 + Math.floor(Math.random() * 80)
          ctx.fillStyle = warm
            ? `rgb(${br},${Math.floor(br * 0.85)},${Math.floor(br * 0.5)})`
            : `rgb(${Math.floor(br * 0.7)},${Math.floor(br * 0.8)},${br})`
          ctx.fillRect(wx, wy, 3, 2)
        }
      }
    }
  }

  const streetGrad = ctx.createLinearGradient(0, horizon, 0, h)
  streetGrad.addColorStop(0, 'rgba(255,180,80,0.05)')
  streetGrad.addColorStop(0.3, 'rgba(255,150,50,0.08)')
  streetGrad.addColorStop(1, 'rgba(255,100,30,0.03)')
  ctx.fillStyle = streetGrad
  ctx.fillRect(0, horizon, w, h - horizon)

  for (let i = 0; i < 500; i++) {
    const colors = ['#ffaa44', '#ff6622', '#ffffff', '#88aaff']
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)]
    ctx.globalAlpha = 0.2 + Math.random() * 0.6
    ctx.fillRect(Math.random() * w, horizon + Math.random() * (h - horizon), 1 + Math.random() * 2, 1)
  }
  ctx.globalAlpha = 1

  return new THREE.CanvasTexture(canvas)
}

// --- Room builders ---

function wall(w, h, mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat || wallMat)
  m.receiveShadow = true
  return m
}

export function buildApartment() {
  const apt = new THREE.Group()
  const H = 3.2

  // --- Shell (14W × 14D) ---
  // X: -10 to +4, Z: -11 to +3

  const floorG = new THREE.PlaneGeometry(14, 14)
  const floor = new THREE.Mesh(floorG, hardwood)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(-3, 0, -4)
  floor.receiveShadow = true
  apt.add(floor)

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), ceilingMat)
  ceil.rotation.x = Math.PI / 2
  ceil.position.set(-3, H, -4)
  apt.add(ceil)

  // Outer walls
  const back = wall(14, H); back.position.set(-3, H / 2, -11); apt.add(back)
  // Front wall with apartment door (door at X=-1 to X=+0.2, facing avatar)
  const doorW = 1.0, doorH = 2.3, doorX = -0.4
  const frontLeftW = doorX - (-10) - doorW / 2
  const frontRightW = 4 - (doorX + doorW / 2)
  const fl = wall(frontLeftW, H); fl.rotation.y = Math.PI
  fl.position.set(-10 + frontLeftW / 2, H / 2, 3); apt.add(fl)
  const fr = wall(frontRightW, H); fr.rotation.y = Math.PI
  fr.position.set(4 - frontRightW / 2, H / 2, 3); apt.add(fr)
  const frontHeader = wall(doorW, H - doorH); frontHeader.rotation.y = Math.PI
  frontHeader.position.set(doorX, doorH + (H - doorH) / 2, 3); apt.add(frontHeader)
  // Door panel
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.6 })
  const doorPanel = new THREE.Mesh(new RoundedBoxGeometry(doorW - 0.05, doorH - 0.05, 0.05, 3, 0.01), doorMat)
  doorPanel.position.set(doorX, doorH / 2, 2.97)
  apt.add(doorPanel)
  // Door handle
  const handleMat = new THREE.MeshStandardMaterial({ color: 0xc0b080, metalness: 0.8, roughness: 0.2 })
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 12), handleMat)
  handle.rotation.x = Math.PI / 2
  handle.position.set(doorX + 0.35, 1.05, 2.94)
  apt.add(handle)
  const left = wall(14, H); left.rotation.y = Math.PI / 2; left.position.set(-10, H / 2, -4); apt.add(left)

  // Right wall — floor-to-ceiling windows along full depth
  const rightX = 4
  const winDepth = 14
  const panes = 7
  const paneD = winDepth / panes

  for (let i = 0; i <= panes; i++) {
    const z = -11 + paneD * i
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, H, 0.06), darkMetal)
    m.position.set(rightX, H / 2, z)
    apt.add(m)
  }
  for (const y of [H, H * 0.6]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, winDepth), darkMetal)
    rail.position.set(rightX, y, -4)
    apt.add(rail)
  }
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(winDepth, H), glassMat)
  glass.rotation.y = -Math.PI / 2
  glass.position.set(rightX - 0.01, H / 2, -4)
  apt.add(glass)

  // City backdrop
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 45),
    new THREE.MeshBasicMaterial({ map: buildCityBackdrop() })
  )
  backdrop.rotation.y = -Math.PI / 2
  backdrop.position.set(18, 4, -4)
  apt.add(backdrop)

  // --- Interior Partitions ---

  // Kitchen/Living counter bar (X=-4, Z:-2 to +2.5, counter height)
  const counterH = 1.05
  const counterBar = new THREE.Mesh(new RoundedBoxGeometry(0.2, counterH, 4.5, 3, 0.02), cabinetMat)
  counterBar.position.set(-4, counterH / 2, 0.25)
  counterBar.castShadow = true
  apt.add(counterBar)
  const counterSurface = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.04, 4.5, 3, 0.01), counterTop)
  counterSurface.position.set(-4, counterH + 0.02, 0.25)
  apt.add(counterSurface)

  // Kitchen/Bathroom wall (Z=-2, X:-10 to -5) — double-sided
  const intWallMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d8, roughness: 0.95, side: THREE.DoubleSide })
  const kbWall = new THREE.Mesh(new THREE.PlaneGeometry(5, H), intWallMat)
  kbWall.position.set(-7.5, H / 2, -2)
  kbWall.receiveShadow = true
  apt.add(kbWall)

  // Bathroom right wall (X=-5, Z:-5 to -2) with door opening — double-sided
  const bathDoorH = 2.2
  const bathRightSolid = new THREE.Mesh(new THREE.PlaneGeometry(2.2, H), intWallMat)
  bathRightSolid.rotation.y = -Math.PI / 2
  bathRightSolid.position.set(-5, H / 2, -3.9)
  bathRightSolid.receiveShadow = true
  apt.add(bathRightSolid)
  const bathHeader = new THREE.Mesh(new THREE.PlaneGeometry(0.8, H - bathDoorH), intWallMat)
  bathHeader.rotation.y = -Math.PI / 2
  bathHeader.position.set(-5, bathDoorH + (H - bathDoorH) / 2, -2.4)
  apt.add(bathHeader)

  // Living/Bedroom partition (Z=-5) with archway — double-sided so visible from both rooms
  const partitionMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d8, roughness: 0.95, side: THREE.DoubleSide })
  // X:-10 to -2: solid
  const partLeft = new THREE.Mesh(new THREE.PlaneGeometry(8, H), partitionMat)
  partLeft.position.set(-6, H / 2, -5)
  partLeft.receiveShadow = true
  apt.add(partLeft)
  // X:-2 to +1: archway (3m opening) — just a header beam
  const archHeader = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 0.15), wallMat)
  archHeader.position.set(-0.5, H - 0.075, -5)
  apt.add(archHeader)
  // X:+1 to +4: solid
  const partRight = new THREE.Mesh(new THREE.PlaneGeometry(3, H), partitionMat)
  partRight.position.set(2.5, H / 2, -5)
  partRight.receiveShadow = true
  apt.add(partRight)

  // Bathroom floor tile overlay
  const bathTile = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), tileMat)
  bathTile.rotation.x = -Math.PI / 2
  bathTile.position.set(-7.5, 0.003, -3.5)
  apt.add(bathTile)

  // ============================
  // LIVING ROOM (existing)
  // ============================

  // Sofa
  const sofa = new THREE.Group()
  const sofaW = 2.0, sofaD = 0.8, sofaSeatH = 0.42, sofaBackH = 0.35

  const seat = new THREE.Mesh(new RoundedBoxGeometry(sofaW, sofaSeatH, sofaD, 4, 0.05), sofaFabric)
  seat.position.y = sofaSeatH / 2; seat.castShadow = true; seat.receiveShadow = true
  sofa.add(seat)

  const sBack = new THREE.Mesh(new RoundedBoxGeometry(sofaW, sofaBackH, 0.15, 4, 0.04), sofaFabric)
  sBack.position.set(0, sofaSeatH + sofaBackH / 2, -sofaD / 2 + 0.075); sBack.castShadow = true
  sofa.add(sBack)

  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new RoundedBoxGeometry(0.12, sofaBackH * 0.7, sofaD, 4, 0.03), sofaFabric)
    arm.position.set(s * (sofaW / 2 - 0.06), sofaSeatH + sofaBackH * 0.35, 0); arm.castShadow = true
    sofa.add(arm)
  }
  for (const cx of [-0.45, 0.45]) {
    const c = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.12, 0.65, 4, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x444455, roughness: 0.9 }))
    c.position.set(cx, sofaSeatH + 0.06, 0.03)
    sofa.add(c)
  }
  sofa.position.set(-2, 0, -4)
  apt.add(sofa)

  // Coffee table
  const table = new THREE.Group()
  const tLegMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.3 })
  const tTop = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.04, 0.55, 4, 0.01),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.1 }))
  tTop.position.y = 0.4; tTop.castShadow = true; tTop.receiveShadow = true
  table.add(tTop)
  for (const [lx, lz] of [[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.22], [0.42, 0.22]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 16), tLegMat)
    leg.position.set(lx, 0.2, lz); table.add(leg)
  }
  table.position.set(-2, 0, -2.8)
  apt.add(table)

  // Floor lamp
  const lamp = new THREE.Group()
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xc0a070, metalness: 0.6, roughness: 0.4 })
  const lPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.7, 24), poleMat)
  lPole.position.y = 0.85; lamp.add(lPole)
  const lBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.03, 32), poleMat)
  lBase.position.y = 0.015; lamp.add(lBase)
  const lShade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.3, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xf5e6d0, roughness: 0.9, side: THREE.DoubleSide }))
  lShade.position.y = 1.85; lamp.add(lShade)
  const lampBulb = new THREE.PointLight(0xffe0b0, 1.5, 6, 1.5)
  lampBulb.position.y = 1.8; lampBulb.castShadow = true
  lamp.add(lampBulb)
  lamp.position.set(-3.2, 0, -2)
  apt.add(lamp)

  // Rug
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.5),
    new THREE.MeshStandardMaterial({ color: 0x6b5b4a, roughness: 0.95 }))
  rug.rotation.x = -Math.PI / 2; rug.position.set(-1, 0.005, -2.5)
  apt.add(rug)

  // Side table
  const sideT = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 32),
    new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.5, metalness: 0.1 }))
  sideT.position.set(-3.2, 0.25, -4); sideT.castShadow = true
  apt.add(sideT)

  // ============================
  // KITCHEN (X:-10 to -4, Z:-2 to +3)
  // ============================

  // L-shaped counter along left wall and front wall
  // Left wall run: X=-9.7, Z:-1.5 to +2.5
  const kcBase1 = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.88, 4, 3, 0.02), cabinetMat)
  kcBase1.position.set(-9.7, 0.44, 0.5); kcBase1.castShadow = true
  apt.add(kcBase1)
  const kcTop1 = new THREE.Mesh(new RoundedBoxGeometry(0.65, 0.04, 4.1, 3, 0.01), counterTop)
  kcTop1.position.set(-9.7, 0.9, 0.5)
  apt.add(kcTop1)

  // Front wall run: Z=+2.5, X:-9.4 to -5.5
  const kcBase2 = new THREE.Mesh(new RoundedBoxGeometry(3.9, 0.88, 0.6, 3, 0.02), cabinetMat)
  kcBase2.position.set(-7.45, 0.44, 2.5); kcBase2.castShadow = true
  apt.add(kcBase2)
  const kcTop2 = new THREE.Mesh(new RoundedBoxGeometry(4, 0.04, 0.65, 3, 0.01), counterTop)
  kcTop2.position.set(-7.45, 0.9, 2.5)
  apt.add(kcTop2)

  // Upper cabinets on left wall
  for (let i = 0; i < 3; i++) {
    const cab = new THREE.Mesh(new RoundedBoxGeometry(0.35, 0.6, 1.1, 3, 0.015), cabinetMat)
    cab.position.set(-9.8, 1.7, -0.8 + i * 1.3); cab.castShadow = true
    apt.add(cab)
  }

  // Fridge
  const fridge = new THREE.Mesh(new RoundedBoxGeometry(0.7, 1.9, 0.7, 3, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6, roughness: 0.3 }))
  fridge.position.set(-9.65, 0.95, -1.5); fridge.castShadow = true
  apt.add(fridge)

  // Kitchen island
  const island = new THREE.Mesh(new RoundedBoxGeometry(1.8, 0.9, 0.7, 3, 0.02), cabinetMat)
  island.position.set(-7, 0.45, 0); island.castShadow = true
  apt.add(island)
  const islandTop = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.04, 0.8, 3, 0.01), counterTop)
  islandTop.position.set(-7, 0.92, 0)
  apt.add(islandTop)

  // Bar stools
  const stoolMetal = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.9, roughness: 0.25 })
  for (const sx of [-7.4, -6.6]) {
    const stool = new THREE.Group()
    const sSeat = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.05, 24), sofaFabric)
    sSeat.position.y = 0.7
    stool.add(sSeat)
    const sPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.68, 16), stoolMetal)
    sPole.position.y = 0.36
    stool.add(sPole)
    const sBase = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.02, 24), stoolMetal)
    sBase.position.y = 0.01
    stool.add(sBase)
    stool.position.set(sx, 0, 0.7)
    apt.add(stool)
  }

  // Kitchen pendant light
  const kitchenLight = new THREE.PointLight(0xffeedd, 1.0, 5, 1.5)
  kitchenLight.position.set(-7, 2.6, 0.5)
  apt.add(kitchenLight)

  // ============================
  // BEDROOM (X:-10 to +4, Z:-11 to -5)
  // ============================

  // Bed (queen size)
  const bed = new THREE.Group()
  // Frame
  const frame = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.3, 2.2, 3, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.7 }))
  frame.position.y = 0.15; frame.castShadow = true; frame.receiveShadow = true
  bed.add(frame)
  // Mattress
  const mattress = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.2, 2.1, 4, 0.04), bedFabric)
  mattress.position.y = 0.4; mattress.castShadow = true
  bed.add(mattress)
  // Pillows
  for (const px of [-0.4, 0.4]) {
    const pillow = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.1, 0.35, 4, 0.04), bedFabric)
    pillow.position.set(px, 0.55, -0.75)
    bed.add(pillow)
  }
  // Headboard
  const headboard = new THREE.Mesh(new RoundedBoxGeometry(1.8, 0.8, 0.08, 3, 0.02), sofaFabric)
  headboard.position.set(0, 0.7, -1.1); headboard.castShadow = true
  bed.add(headboard)
  bed.position.set(-2, 0, -9)
  apt.add(bed)

  // Nightstands
  for (const [nx, nz] of [[-3.5, -9.8], [-0.5, -9.8]]) {
    const ns = new THREE.Mesh(new RoundedBoxGeometry(0.45, 0.5, 0.4, 3, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.7 }))
    ns.position.set(nx, 0.25, nz); ns.castShadow = true
    apt.add(ns)
  }

  // Nightstand lamp
  const nsLamp = new THREE.PointLight(0xffcc88, 0.5, 4, 1.5)
  nsLamp.position.set(-3.5, 0.8, -9.8)
  apt.add(nsLamp)

  // Dresser (against right area)
  const dresser = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.85, 0.45, 3, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.7 }))
  dresser.position.set(2.5, 0.425, -10.2); dresser.castShadow = true
  apt.add(dresser)

  // Bedroom rug
  const bedRug = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3),
    new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.95 }))
  bedRug.rotation.x = -Math.PI / 2; bedRug.position.set(-2, 0.005, -8)
  apt.add(bedRug)

  // Bedroom ceiling light
  const bedroomLight = new THREE.PointLight(0xffe8c0, 0.4, 8, 1.5)
  bedroomLight.position.set(-2, 2.8, -8)
  apt.add(bedroomLight)

  // ============================
  // BATHROOM (X:-10 to -5, Z:-5 to -2)
  // ============================

  // Vanity
  const vanity = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.85, 0.5, 3, 0.02), cabinetMat)
  vanity.position.set(-9.5, 0.425, -3.5); vanity.castShadow = true
  apt.add(vanity)
  const vanityTop = new THREE.Mesh(new RoundedBoxGeometry(1.05, 0.04, 0.55, 3, 0.01), porcelainMat)
  vanityTop.position.set(-9.5, 0.88, -3.5)
  apt.add(vanityTop)

  // Sink basin
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.08, 24), porcelainMat)
  basin.position.set(-9.5, 0.92, -3.5)
  apt.add(basin)

  // Mirror
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9),
    new THREE.MeshStandardMaterial({ color: 0xaabbcc, metalness: 0.95, roughness: 0.05 }))
  mirror.rotation.y = Math.PI / 2
  mirror.position.set(-9.95, 1.5, -3.5)
  apt.add(mirror)

  // Shower stall (glass panel + tray)
  const showerTray = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.05, 1.0, 3, 0.01), tileMat)
  showerTray.position.set(-7.5, 0.025, -4.5)
  apt.add(showerTray)
  const showerGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.1),
    new THREE.MeshPhysicalMaterial({
      color: 0xccddee, transmission: 0.8, thickness: 0.05,
      roughness: 0.3, metalness: 0, ior: 1.5, opacity: 0.2, transparent: true,
    }))
  showerGlass.position.set(-7.5, 1.1, -4.0)
  apt.add(showerGlass)
  // Shower head (small cylinder)
  const shHead = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16), darkMetal)
  shHead.position.set(-7.5, 2.2, -4.9)
  apt.add(shHead)

  // Toilet
  const toiletBase = new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.38, 0.5, 3, 0.04), porcelainMat)
  toiletBase.position.set(-9.0, 0.19, -4.5); toiletBase.castShadow = true
  apt.add(toiletBase)
  const toiletTank = new THREE.Mesh(new RoundedBoxGeometry(0.35, 0.35, 0.18, 3, 0.03), porcelainMat)
  toiletTank.position.set(-9.0, 0.35, -4.84)
  apt.add(toiletTank)

  // Bath mat
  const bathMat = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0),
    new THREE.MeshStandardMaterial({ color: 0xd0c8c0, roughness: 0.95 }))
  bathMat.rotation.x = -Math.PI / 2; bathMat.position.set(-7.5, 0.006, -3.5)
  apt.add(bathMat)

  // Bathroom ceiling light
  const bathLight = new THREE.PointLight(0xddeeff, 0.8, 5, 1.5)
  bathLight.position.set(-7.5, 3.0, -3.5)
  apt.add(bathLight)

  // ============================
  // MOVING BOXES (all rooms)
  // ============================

  // Living room (existing positions)
  addBox(apt, [2.5, 0, -4.5], { y: 0.15 }, makeClosedBox, 0.55, 0.4, 0.45)
  addBox(apt, [2.5, 0.4, -4.5], { y: -0.2 }, makeClosedBox, 0.5, 0.35, 0.4)
  addBox(apt, [2.5, 0.75, -4.5], { y: 0.3 }, makeClosedBox, 0.4, 0.3, 0.35)
  addBox(apt, [3.0, 0, -2.5], { y: -0.1 }, makeClosedBox, 0.5, 0.5, 0.45)
  addBox(apt, [1.5, 0, -1.0], { y: 0.6 }, makeOpenBox, 0.55, 0.3, 0.45)
  addBox(apt, [-1.2, 0, -4.5], { y: -0.3 }, makeOpenBox, 0.5, 0.35, 0.4)
  addBox(apt, [1.8, 0.2, -3.8], { y: 0.5, z: Math.PI / 2 }, makeClosedBox, 0.45, 0.4, 0.4)
  addBox(apt, [-2.0, 0.42, -2.8], { y: 0.2 }, makeClosedBox, 0.25, 0.18, 0.2)

  // Kitchen boxes
  addBox(apt, [-8, 0, 1.5], { y: 0.3 }, makeClosedBox, 0.5, 0.35, 0.4)
  addBox(apt, [-5.5, 0, -0.5], { y: -0.4 }, makeOpenBox, 0.5, 0.3, 0.45)

  // Bedroom boxes
  addBox(apt, [2, 0, -10], { y: 0.1 }, makeClosedBox, 0.55, 0.45, 0.5)
  addBox(apt, [2, 0.45, -10], { y: -0.15 }, makeClosedBox, 0.45, 0.35, 0.4)
  addBox(apt, [-8, 0, -7], { y: 0.5 }, makeOpenBox, 0.55, 0.3, 0.45)

  // Bathroom box
  addBox(apt, [-6, 0, -2.8], { y: 0.2 }, makeClosedBox, 0.4, 0.35, 0.35)

  // ============================
  // DECOR — Wall Art, TV, Plants, Piano, Ceiling Lights
  // ============================

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.3 })

  function makeFramedArt(w, h, artColor) {
    const g = new THREE.Group()
    const frameDepth = 0.03, border = 0.04
    const f = new THREE.Mesh(new THREE.BoxGeometry(w + border * 2, h + border * 2, frameDepth), frameMat)
    g.add(f)
    const canvas = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ color: artColor, roughness: 0.8 }))
    canvas.position.z = frameDepth / 2 + 0.001
    g.add(canvas)
    return g
  }

  // Living room — two prints on partition wall (Z=-5, faces +Z)
  const art1 = makeFramedArt(0.7, 0.5, 0x2244aa)
  art1.position.set(1.8, 1.8, -4.985); apt.add(art1)
  const art2 = makeFramedArt(0.5, 0.7, 0x884422)
  art2.position.set(3.0, 1.7, -4.985); apt.add(art2)

  // Bedroom — print above headboard (back wall Z=-11, faces +Z)
  const art3 = makeFramedArt(1.0, 0.6, 0x334455)
  art3.position.set(-2, 2.2, -10.985); apt.add(art3)

  // Kitchen — small piece on left wall (X=-10, faces +X)
  const art4 = makeFramedArt(0.5, 0.4, 0xaa6633)
  art4.rotation.y = Math.PI / 2
  art4.position.set(-9.985, 1.6, 0); apt.add(art4)

  // --- TV (flatscreen on stand, living room right side) ---
  const tvStand = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.45, 0.4, 3, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.1 }))
  tvStand.position.set(2.5, 0.225, -2); tvStand.castShadow = true
  apt.add(tvStand)

  const tvScreen = new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.65, 0.04, 3, 0.01),
    new THREE.MeshStandardMaterial({ color: 0x050510, roughness: 0.1, metalness: 0.3 }))
  tvScreen.position.set(2.5, 0.78, -2); tvScreen.castShadow = true
  apt.add(tvScreen)
  // Thin bezel glow
  const tvGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.6),
    new THREE.MeshBasicMaterial({ color: 0x111122 }))
  tvGlow.position.set(2.5, 0.78, -1.975)
  apt.add(tvGlow)

  // --- Plants ---
  const potMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.8 })
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.8 })
  const leafLight = new THREE.MeshStandardMaterial({ color: 0x3a7a30, roughness: 0.8 })

  function makePlant(potR, potH, leafR, leafH, leafCount) {
    const g = new THREE.Group()
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(potR, potR * 0.8, potH, 24), potMat)
    pot.position.y = potH / 2; pot.castShadow = true
    g.add(pot)
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(potR - 0.01, potR - 0.01, 0.02, 24),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1.0 }))
    soil.position.y = potH; g.add(soil)
    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2 + Math.random() * 0.5
      const lR = leafR * (0.7 + Math.random() * 0.3)
      const lH = leafH * (0.8 + Math.random() * 0.4)
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(lR, 8, 6),
        i % 2 === 0 ? leafMat : leafLight
      )
      leaf.scale.y = lH / lR
      leaf.position.set(
        Math.cos(angle) * potR * 0.5,
        potH + lH * 0.6,
        Math.sin(angle) * potR * 0.5
      )
      g.add(leaf)
    }
    return g
  }

  // Large plant — living room corner near windows
  const plant1 = makePlant(0.18, 0.35, 0.2, 0.4, 5)
  plant1.position.set(3.3, 0, 1.5); apt.add(plant1)

  // Medium plant — kitchen counter
  const plant2 = makePlant(0.08, 0.12, 0.1, 0.15, 4)
  plant2.position.set(-9.5, 0.92, 1.5); apt.add(plant2)

  // Small plant — bedroom dresser
  const plant3 = makePlant(0.06, 0.1, 0.08, 0.12, 3)
  plant3.position.set(2.5, 0.87, -10.2); apt.add(plant3)

  // Tall plant — near bedroom archway
  const plant4 = makePlant(0.2, 0.4, 0.25, 0.5, 6)
  plant4.position.set(-3.0, 0, -5.5); apt.add(plant4)

  // Small plant — bathroom vanity
  const plant5 = makePlant(0.05, 0.08, 0.06, 0.1, 3)
  plant5.position.set(-9.2, 0.92, -3.2); apt.add(plant5)

  // --- Upright Piano (living room, against partition) ---
  const piano = new THREE.Group()
  const pianoWood = new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 0.4, metalness: 0.05 })

  // Body
  const pianoBody = new THREE.Mesh(new RoundedBoxGeometry(1.4, 1.1, 0.55, 3, 0.02), pianoWood)
  pianoBody.position.set(0, 0.55, 0); pianoBody.castShadow = true
  piano.add(pianoBody)

  // Top lid
  const pianoLid = new THREE.Mesh(new RoundedBoxGeometry(1.44, 0.03, 0.58, 3, 0.01), pianoWood)
  pianoLid.position.set(0, 1.12, 0)
  piano.add(pianoLid)

  // Keyboard shelf
  const keyShelf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }))
  keyShelf.position.set(0, 0.72, 0.35)
  piano.add(keyShelf)

  // Keys (white strip + black accents)
  const whiteKeys = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.015, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xf5f0e8, roughness: 0.3 }))
  whiteKeys.position.set(0, 0.735, 0.35)
  piano.add(whiteKeys)

  for (let k = 0; k < 8; k++) {
    if ([1, 2, 4, 5, 6].includes(k % 7) || k === 7) {
      const bk = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, 0.07),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 }))
      bk.position.set(-0.45 + k * 0.12, 0.745, 0.32)
      piano.add(bk)
    }
  }

  // Pedals
  for (const px of [-0.12, 0, 0.12]) {
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.08), darkMetal)
    pedal.position.set(px, 0.01, 0.35)
    piano.add(pedal)
  }

  // Bench
  const bench = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.05, 0.3, 3, 0.01), pianoWood)
  bench.position.set(0, 0.45, 0.7)
  piano.add(bench)
  for (const [bx, bz] of [[-0.35, 0.55], [0.35, 0.55], [-0.35, 0.85], [0.35, 0.85]]) {
    const bLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.43, 12), pianoWood)
    bLeg.position.set(bx, 0.22, bz)
    piano.add(bLeg)
  }

  piano.position.set(-1.5, 0, -4.85)
  piano.rotation.y = Math.PI
  apt.add(piano)

  // --- Ceiling Lights ---

  function makeRecessedLight(x, z, color, intensity, range) {
    const fixture = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.03, 24),
      new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 }))
    fixture.position.set(x, H - 0.015, z)
    fixture.rotation.x = Math.PI
    apt.add(fixture)
    const light = new THREE.PointLight(color || 0xffeedd, intensity || 0.6, range || 5, 1.5)
    light.position.set(x, H - 0.05, z)
    apt.add(light)
  }

  // Living room — 3 recessed spots
  makeRecessedLight(0, -1, 0xffeedd, 0.5, 5)
  makeRecessedLight(-2, -3, 0xffeedd, 0.4, 5)
  makeRecessedLight(2, -3, 0xffeedd, 0.4, 5)

  // Hallway/transition area
  makeRecessedLight(-0.5, -5, 0xffeedd, 0.3, 4)

  // Kitchen — add a second spot
  makeRecessedLight(-5.5, 1, 0xffeedd, 0.4, 4)

  return { group: apt }
}
