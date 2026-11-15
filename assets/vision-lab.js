/* Browser-side YOLO26n detector. Image inference stays in the visitor's browser. */
const PACKAGE_URL = 'https://esm.sh/@ultralytics/yolo@0.0.49?bundle';
const DEFAULT_MODEL_URL = 'https://huggingface.co/prithivMLmods/YOLO26-ONNX/resolve/main/yolo26n/yolo26n.onnx?download=true';
const byId = (id) => document.getElementById(id);
let enginePromise = null;
let detector = null;
let mediaStream = null;
let animationId = 0;
let inferenceBusy = false;
let lastInferenceAt = 0;
let currentImageURL = null;
let stopped = true;

function status(title, message, type = 'info') {
  const box = byId('vision-status');
  if (!box) return;
  box.className = `notice-box vision-status ${type}`;
  box.innerHTML = `<div><b>${escapeHtml(title)}</b><p>${escapeHtml(message)}</p></div>`;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function confidenceThreshold() { return Number(byId('vision-confidence')?.value || 0.35); }
function resultShape(results) {
  if (Array.isArray(results)) return results[0] || {boxes: []};
  return results || {boxes: []};
}
function filteredResult(results) {
  const result = resultShape(results);
  const boxes = Array.isArray(result.boxes) ? result.boxes : [];
  return {...result, boxes: boxes.filter(box => Number(box.conf ?? 0) >= confidenceThreshold())};
}
function showSummary(results) {
  const result = filteredResult(results);
  const boxes = Array.isArray(result.boxes) ? result.boxes : [];
  const target = byId('vision-detection-summary');
  if (!target) return;
  if (!boxes.length) {
    target.innerHTML = '<div class="empty-state compact"><p>No objects above this confidence threshold. Try lowering the threshold or using a clearer, brighter image.</p></div>';
    return;
  }
  const counts = new Map();
  for (const box of boxes) {
    const name = String(box.name || `Class ${box.cls ?? '?'}`);
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  target.innerHTML = `<div class="vision-total"><b>${boxes.length}</b><span>object detection${boxes.length === 1 ? '' : 's'} above threshold</span></div>`
    + [...counts.entries()].sort((a,b) => b[1]-a[1]).map(([name,count]) => `<div class="vision-detection-row"><span class="vision-detection-swatch"></span><b>${escapeHtml(name)}</b><span>${count} detected</span></div>`).join('')
    + `<details class="vision-box-list"><summary>Bounding boxes and confidence</summary>${boxes.map((box,index) => `<div><b>${index+1}. ${escapeHtml(box.name || `Class ${box.cls ?? '?'}`)}</b><span>${(Number(box.conf || 0)*100).toFixed(1)}% · x ${Number(box.x1||0).toFixed(0)}, y ${Number(box.y1||0).toFixed(0)}, w ${(Number(box.x2||0)-Number(box.x1||0)).toFixed(0)}, h ${(Number(box.y2||0)-Number(box.y1||0)).toFixed(0)}</span></div>`).join('')}</details>`;
}
async function loadEngine() {
  if (detector) return detector;
  if (!enginePromise) {
    enginePromise = (async () => {
      status('Loading browser inference runtime', 'Downloading the detector package and ONNX Runtime Web. The first run may take several seconds and uses browser-cached assets.', 'info');
      const mod = await import(PACKAGE_URL);
      if (!mod.YOLO || !mod.annotate) throw new Error('The browser inference package did not expose the expected YOLO / annotate API. Check the package version or network access.');
      status('Loading YOLO26n model', 'Downloading approximately 10 MB of model weights from the public Hugging Face model repository. The image is not uploaded to your EARTHSCOPE PHP server.', 'info');
      const modelUrl = (window.EARTHSCOPE_CONFIG && window.EARTHSCOPE_CONFIG.yoloModelUrl) || DEFAULT_MODEL_URL;
      const model = await mod.YOLO.load(modelUrl);
      detector = {model, annotate: mod.annotate};
      status('Model loaded', `Browser detector ready. Runtime device: ${model.device || 'automatic WebGPU/CPU selection'}.`, 'success');
      return detector;
    })().catch(error => { enginePromise = null; throw error; });
  }
  return enginePromise;
}
async function runImage() {
  const file = byId('vision-file')?.files?.[0];
  if (!file) { status('Choose an image first', 'Select a JPEG, PNG, WebP or AVIF image to run local object detection.', 'warn'); return; }
  if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type) || file.size > 12 * 1024 * 1024) { status('Unsupported image', 'Choose a JPEG, PNG, WebP or AVIF file smaller than 12 MB.', 'warn'); return; }
  try {
    if (currentImageURL) URL.revokeObjectURL(currentImageURL);
    currentImageURL = URL.createObjectURL(file);
    const img = byId('vision-image'); img.src = currentImageURL; img.hidden = false; byId('vision-video').hidden = true;
    await img.decode();
    const engine = await loadEngine();
    status('Analysing image', 'Running YOLO26n locally in this browser. Performance depends on hardware and browser acceleration.', 'info');
    const results = await engine.model.predict(img);
    await engine.annotate(byId('vision-canvas'), img, filteredResult(results));
    showSummary(results);
    status('Detection complete', `${Array.isArray(resultShape(results).boxes) ? resultShape(results).boxes.length : 0} raw detections returned. Review class labels and confidence; this model does not identify all fruit/vegetable species or diagnose plant disease.`, 'success');
  } catch (error) {
    console.error('[EARTHSCOPE Vision]', error);
    status('Detection could not run', `${error.message || error}. Check CDN/model CORS access, supported browser features and network restrictions. A browser refresh can retry after a partial download.`, 'warn');
  }
}
async function inferWebcamFrame(now) {
  if (stopped || !mediaStream) return;
  animationId = requestAnimationFrame(inferWebcamFrame);
  const video = byId('vision-video');
  if (!video || video.readyState < 2 || inferenceBusy || now - lastInferenceAt < 850) return;
  inferenceBusy = true; lastInferenceAt = now;
  try {
    const engine = await loadEngine();
    const results = await engine.model.predict(video);
    await engine.annotate(byId('vision-canvas'), video, filteredResult(results));
    showSummary(results);
    status('Webcam detection running', `Detected ${resultShape(results).boxes?.length || 0} objects in the last inference. Inference is throttled to protect device performance.`, 'success');
  } catch (error) {
    console.error('[EARTHSCOPE Vision webcam]', error);
    status('Webcam inference stopped', `${error.message || error}. Try a photo instead or use a browser with WebGPU/ONNX Runtime support.`, 'warn');
    stopCamera();
  } finally { inferenceBusy = false; }
}
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) { status('Camera not available', 'This browser does not expose getUserMedia. Use a secure HTTPS origin and a supported browser.', 'warn'); return; }
  try {
    stopCamera();
    mediaStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
    const video = byId('vision-video'); video.srcObject = mediaStream; video.hidden = false; byId('vision-image').hidden = true;
    await video.play();
    stopped = false; byId('vision-start-camera').disabled = true; byId('vision-stop-camera').disabled = false;
    status('Webcam active', 'Your camera stream is processed locally in your browser. Avoid capturing people or sensitive information without consent.', 'info');
    animationId = requestAnimationFrame(inferWebcamFrame);
  } catch (error) {
    stopCamera(); status('Camera permission failed', `${error.message || error}. Allow camera access in browser settings and ensure the website uses HTTPS.`, 'warn');
  }
}
function stopCamera() {
  stopped = true;
  if (animationId) cancelAnimationFrame(animationId);
  animationId = 0;
  if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
  mediaStream = null;
  const video = byId('vision-video'); if (video) {video.pause(); video.srcObject = null; video.hidden = true;}
  if (byId('vision-start-camera')) byId('vision-start-camera').disabled = false;
  if (byId('vision-stop-camera')) byId('vision-stop-camera').disabled = true;
}
function bind() {
  byId('vision-run-image')?.addEventListener('click', runImage);
  byId('vision-start-camera')?.addEventListener('click', startCamera);
  byId('vision-stop-camera')?.addEventListener('click', stopCamera);
  byId('vision-confidence')?.addEventListener('input', event => {
    if (byId('vision-confidence-value')) byId('vision-confidence-value').textContent = Number(event.target.value).toFixed(2);
  });
  byId('vision-file')?.addEventListener('change', () => {
    const file = byId('vision-file').files?.[0];
    if (file) status('Image selected', `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB. Select Detect objects to run local inference.`, 'info');
  });
  window.addEventListener('pagehide', stopCamera);
  document.querySelectorAll('.nav-item[data-panel="vision"]').forEach(button => button.addEventListener('click', stopCamera));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, {once:true}); else bind();
