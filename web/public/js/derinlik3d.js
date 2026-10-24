// Tek fotoğraf + derinlik haritasından derinlikli görünüm (WebGL paralaks). Kütüphane gerektirmez.
// Derinlik: beyaz = yakın. Fare/parmak hareketiyle yakın nesneler uzaktakilerden daha çok kayar.

const KOSE = `attribute vec2 k; varying vec2 uv; void main(){ uv = vec2(k.x, -k.y) * .5 + .5; gl_Position = vec4(k, 0., 1.); }`;
const PARCA = `precision mediump float;
varying vec2 uv; uniform sampler2D foto, derinlik; uniform vec2 kay; uniform vec2 kenar;
void main(){
  // Kenarda boşluk görünmesin diye görüntü biraz büyütülür; ardından derinliğe göre birkaç adımda kaydırılır.
  vec2 t = (uv - .5) * kenar + .5;
  vec2 p = t;
  for (int i = 0; i < 6; i++) { float d = texture2D(derinlik, p).r; p = t + kay * (d - .45); }
  gl_FragColor = texture2D(foto, clamp(p, 0., 1.));
}`;

const yukle = (src) => new Promise((ok, hata) => {
  const g = new Image(); g.crossOrigin = "anonymous"; g.onload = () => ok(g); g.onerror = hata; g.src = src;
});

export async function derinlikGoster(tuval, fotoUrl, derinlikUrl, { guc = 0.035 } = {}) {
  const gl = tuval.getContext("webgl", { antialias: false, premultipliedAlpha: false });
  if (!gl) throw new Error("WebGL yok");
  const [foto, derinlik] = await Promise.all([yukle(fotoUrl), yukle(derinlikUrl)]);
  const oran = foto.naturalWidth / foto.naturalHeight;
  const boyutla = () => {
    // Genişlik kabın genişliği, ama yükseklik ekranın %60'ını geçmesin.
    const kap = tuval.closest("dialog"), genislik = kap ? kap.clientWidth - 32 : tuval.parentElement.clientWidth;
    const w = Math.min(genislik, innerHeight * 0.6 * oran), h = w / oran, dpr = Math.min(devicePixelRatio || 1, 2);
    tuval.style.width = `${w}px`;
    tuval.style.height = `${h}px`;
    tuval.width = Math.round(w * dpr); tuval.height = Math.round(h * dpr);
    gl.viewport(0, 0, tuval.width, tuval.height);
  };
  const derle = (tur, kaynak) => { const s = gl.createShader(tur); gl.shaderSource(s, kaynak); gl.compileShader(s); return s; };
  const pr = gl.createProgram();
  gl.attachShader(pr, derle(gl.VERTEX_SHADER, KOSE)); gl.attachShader(pr, derle(gl.FRAGMENT_SHADER, PARCA));
  gl.linkProgram(pr); gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const k = gl.getAttribLocation(pr, "k"); gl.enableVertexAttribArray(k); gl.vertexAttribPointer(k, 2, gl.FLOAT, false, 0, 0);
  const doku = (birim, img, ad) => {
    gl.activeTexture(gl.TEXTURE0 + birim); gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.uniform1i(gl.getUniformLocation(pr, ad), birim);
  };
  doku(0, foto, "foto"); doku(1, derinlik, "derinlik");
  const kayU = gl.getUniformLocation(pr, "kay");
  gl.uniform2f(gl.getUniformLocation(pr, "kenar"), 1 - guc * 2.2, 1 - guc * 2.2);

  let hedef = [0, 0], simdi = [0, 0], son = 0, kare, bitti = false;
  const yon = (x, y) => { const r = tuval.getBoundingClientRect(); hedef = [((x - r.left) / r.width - .5) * 2, ((y - r.top) / r.height - .5) * 2]; son = performance.now(); };
  const fare = (e) => yon(e.clientX, e.clientY);
  const dokun = (e) => { const t = e.touches[0]; if (t) yon(t.clientX, t.clientY); };
  tuval.addEventListener("pointermove", fare);
  tuval.addEventListener("touchmove", dokun, { passive: true });
  const ciz = (z) => {
    if (bitti) return;
    if (z - son > 2500) hedef = [Math.sin(z / 1700) * .7, Math.sin(z / 2300) * .35];   // boştayken hafif salınım
    simdi = simdi.map((v, i) => v + (hedef[i] - v) * .08);
    gl.uniform2f(kayU, -simdi[0] * guc, -simdi[1] * guc);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    kare = requestAnimationFrame(ciz);
  };
  boyutla();
  addEventListener("resize", boyutla);
  kare = requestAnimationFrame(ciz);
  return () => {
    bitti = true; cancelAnimationFrame(kare); removeEventListener("resize", boyutla);
    tuval.removeEventListener("pointermove", fare); tuval.removeEventListener("touchmove", dokun);
  };
}
