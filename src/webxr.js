import * as THREE from 'three';
import { invertPhotoHomography, metricPhotoPlane } from './lib/photoAlignment.js';

export async function startWallXR({ root, canvas, photo, box, onUpdate, onEnd }) {
  // Request the session directly from the user gesture, before awaiting assets.
  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test', 'dom-overlay'],
    domOverlay: { root },
  });
  let renderer; let hitSource; let mesh; let texture; let ended = false;
  let currentHit = null; let hits = []; let hitVisible = false; let poseVisible = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.008, 0.012, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xa8f5a2, side: THREE.DoubleSide, depthTest: false }));
  reticle.matrixAutoUpdate = false; reticle.visible = false; scene.add(reticle);

  function clearMesh() {
    if (!mesh) return;
    scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); mesh = null;
  }
  function cleanup() {
    if (ended) return;
    ended = true; hitSource?.cancel(); renderer?.setAnimationLoop(null);
    clearMesh(); texture?.dispose(); reticle.geometry.dispose(); reticle.material.dispose(); renderer?.dispose();
    onEnd();
  }
  session.addEventListener('end', cleanup, { once: true });
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local');
    await renderer.xr.setSession(session);
    if (ended) throw new Error('La sessione AR è terminata.');
    const viewer = await session.requestReferenceSpace('viewer');
    hitSource = await session.requestHitTestSource({ space: viewer });
    texture = await new THREE.TextureLoader().loadAsync(photo);
    texture.colorSpace = THREE.SRGBColorSpace;
    if (ended) { texture.dispose(); throw new Error('La sessione AR è terminata.'); }
    renderer.setAnimationLoop((_time, frame) => {
      if (!frame || ended) return;
      const space = renderer.xr.getReferenceSpace();
      const viewerPose = frame.getViewerPose(space);
      const hit = frame.getHitTestResults(hitSource)[0];
      const pose = hit?.getPose(space);
      currentHit = viewerPose && pose ? Array.from(pose.transform.matrix) : null;
      reticle.visible = Boolean(currentHit) && !mesh;
      if (currentHit) reticle.matrix.fromArray(currentHit);
      if (mesh) mesh.visible = Boolean(viewerPose);
      if (hitVisible !== Boolean(currentHit) || poseVisible !== Boolean(viewerPose)) {
        hitVisible = Boolean(currentHit); poseVisible = Boolean(viewerPose);
        onUpdate({ hit: hitVisible, pose: poseVisible, count: hits.length, aligned: Boolean(mesh) });
      }
      renderer.render(scene, camera);
    });
    return {
      capture() {
        if (!currentHit) throw new Error('Muovi lentamente il telefono finché il mirino si appoggia alla parete.');
        hits.push(currentHit.slice(12, 15));
        if (hits.length === 4) {
          try {
            const plane = metricPhotoPlane(box, hits);
            const inverse = invertPhotoHomography(plane.homography);
            const xs = plane.bounds.map((p) => p[0]); const ys = plane.bounds.map((p) => p[1]);
            const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
            const geometry = new THREE.PlaneGeometry(maxX - minX, maxY - minY);
            geometry.translate((maxX + minX) / 2, (maxY + minY) / 2, 0);
            const material = new THREE.ShaderMaterial({
              transparent: true, side: THREE.DoubleSide, depthWrite: false,
              uniforms: { image: { value: texture }, opacity: { value: 0.6 }, inverseH: { value: new THREE.Matrix3().set(...inverse) } },
              vertexShader: 'varying vec2 planePoint; void main(){ planePoint = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
              fragmentShader: `uniform sampler2D image; uniform float opacity; uniform mat3 inverseH; varying vec2 planePoint;
                void main(){ vec3 p = inverseH * vec3(planePoint, 1.0); vec2 uv = p.xy / p.z;
                if(p.z <= 0.0 || uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
                gl_FragColor = vec4(texture2D(image, vec2(uv.x, 1.0 - uv.y)).rgb, opacity);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
                }`,
            });
            mesh = new THREE.Mesh(geometry, material);
            mesh.matrixAutoUpdate = false;
            mesh.matrix.makeBasis(new THREE.Vector3(...plane.x), new THREE.Vector3(...plane.y), new THREE.Vector3(...plane.normal));
            mesh.matrix.setPosition(...plane.origin);
            scene.add(mesh); reticle.visible = false;
          } catch (error) { hits = []; onUpdate({ hit: hitVisible, pose: poseVisible, count: 0, aligned: false }); throw error; }
        }
        onUpdate({ hit: hitVisible, pose: poseVisible, count: hits.length, aligned: Boolean(mesh) });
      },
      undo() { clearMesh(); hits.pop(); onUpdate({ hit: hitVisible, pose: poseVisible, count: hits.length, aligned: false }); },
      reset() { clearMesh(); hits = []; onUpdate({ hit: hitVisible, pose: poseVisible, count: 0, aligned: false }); },
      setOpacity(value) { if (mesh) mesh.material.uniforms.opacity.value = value; },
      end() { return session.end(); },
    };
  } catch (error) {
    await session.end().catch(() => {}); cleanup(); throw error;
  }
}
