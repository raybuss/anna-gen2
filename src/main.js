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

let currentVRM = null

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
    scene.add(vrm.scene)
    console.log('VRM loaded', vrm)
  }, (progress) => {
    // progress.loaded / progress.total
  }, (error) => {
    console.error('Failed to load model', error)
  })
}

const defaultURL = '/models/sample.vrm'

document.getElementById('url').value = defaultURL
document.getElementById('load').addEventListener('click', () => {
  const url = document.getElementById('url').value.trim() || defaultURL
  loadVRM(url)
})

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

function animate() {
  requestAnimationFrame(animate)
  renderer.render(scene, camera)
}
animate()

// Auto-load if a file is present at the default path
fetch(defaultURL, { method: 'HEAD' }).then((res) => {
  if (res.ok) loadVRM(defaultURL)
}).catch(() => {})
