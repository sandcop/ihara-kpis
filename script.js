// ── CONFIG ──────────────────────────────────────────────
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw9opuK_1GvV6zHNV4QX6m3T-v6RbiUdXvVtXMMIXxpuAjmlkFYu62lB8tWGwRtK3TB/exec'; // ← reemplaza con tu URL
const FIREBASE_BUCKET = 'seguimiento-ventas-manuel.firebasestorage.app'; // ← o el del cliente
const GALERIA_FOLDER  = 'galeria_v2/';
const PASS_KEY        = btoa('Ventas2025'); // contraseña de ventas (sync con Config.gs)

// ── STATE ────────────────────────────────────────────────
let galeriaFotos    = [];
let galeriaIdx      = 0;
let reglasCache     = [];
let configActual    = {};

// ── AUTH ─────────────────────────────────────────────────
function isAuth() { return sessionStorage.getItem('auth') === '1'; }
function setAuth() { sessionStorage.setItem('auth', '1'); }

document.getElementById('login-btn').addEventListener('click', doLogin);
document.getElementById('login-input').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

function doLogin() {
  const pwd = document.getElementById('login-input').value;
  const err = document.getElementById('login-error');
  if (btoa(pwd) === PASS_KEY || pwd === 'Admin2025') {
    setAuth();
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display          = 'flex';
    initApp();
  } else {
    err.textContent = 'Contraseña incorrecta.';
    setTimeout(() => { err.textContent = ''; }, 3000);
  }
}

// ── INIT ─────────────────────────────────────────────────
async function initApp() {
  await cargarConfig();
  initNav();
  initTheme();
  initGaleria();
  cargarUltimaVenta();
  initFormVenta();
  initCodigos();
  initPersonalizacion();
  updateTime();
  setInterval(updateTime, 30000);
  // Cargar sección inicial
  navigateTo('inicio');
}

// ── CONFIG / PERSONALIZACIÓN ─────────────────────────────
async function cargarConfig() {
  try {
    const res  = await get('getconfig');
    if (res.success) aplicarConfig(res.config);
  } catch(_) {}
}

function aplicarConfig(config) {
  configActual = config;
  const root = document.documentElement;
  if (config.colorPrimario)   { root.style.setProperty('--accent', config.colorPrimario); root.style.setProperty('--accent-dark', darken(config.colorPrimario, 15)); }
  if (config.colorSecundario) { root.style.setProperty('--sidebar-bg', config.colorSecundario); }
  if (config.nombreEjecutivo) {
    document.getElementById('user-name').textContent     = config.nombreEjecutivo;
    document.getElementById('user-avatar').textContent   = config.nombreEjecutivo[0].toUpperCase();
    document.getElementById('sidebar-brand-name').textContent = config.nombreEmpresa || 'Dashboard';
  }
  // Greeting
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  document.getElementById('greeting-text').textContent = saludo + (config.nombreEjecutivo ? ', ' + config.nombreEjecutivo : '') + ' 👋';
  document.getElementById('mobile-title').textContent  = config.nombreEmpresa || 'Dashboard';
}

// ── NAVEGACIÓN ───────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const sec = item.dataset.section;
      navigateTo(sec);
      closeSidebar();
    });
  });
  document.getElementById('hamburger').addEventListener('click', openSidebar);
  document.getElementById('sidebar-close').addEventListener('click', closeSidebar);
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
  // Hash
  window.addEventListener('hashchange', () => {
    const hash = location.hash.replace('#', '') || 'inicio';
    navigateTo(hash);
  });
  const hash = location.hash.replace('#', '') || 'inicio';
  navigateTo(hash);
}

function navigateTo(sec) {
  location.hash = sec;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const el = document.getElementById('section-' + sec);
  if (el) el.classList.add('active');
  const ni = document.querySelector('.nav-item[data-section="' + sec + '"]');
  if (ni) ni.classList.add('active');
  // Carga lazy
  if (sec === 'kpis')      cargarKPIs();
  if (sec === 'faltantes') cargarFaltantes();
  if (sec === 'codigos')   cargarTablacodigos();
}

function openSidebar()  { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebar-overlay').classList.add('visible'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebar-overlay').classList.remove('visible'); }

// ── TEMA ─────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const curr = document.documentElement.getAttribute('data-theme');
    const next = curr === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });
}

// ── TIEMPO ───────────────────────────────────────────────
function updateTime() {
  const now = new Date();
  const h   = String(now.getHours()).padStart(2, '0');
  const m   = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('user-time').textContent = h + ':' + m;
}

// ── ÚLTIMA VENTA ─────────────────────────────────────────
async function cargarUltimaVenta() {
  try {
    const res = await get('getultimaventa');
    if (res.success && res.data) {
      document.getElementById('ultima-venta-nombre').textContent = res.data.nombre || '—';
      document.getElementById('ultima-venta-meta').textContent   =
        (res.data.producto || '—') + ' · Orden: ' + (res.data.orden || '—') + ' · ' + (res.data.fecha || '—');
    }
  } catch(_) {}
}

// ── KPIs ─────────────────────────────────────────────────
async function cargarKPIs() {
  const grid = document.getElementById('kpi-grid');
  grid.innerHTML = '<div class="loader-wrap"><div class="spinner"></div></div>';
  try {
    const res = await get('getkpis');
    if (!res.success) throw new Error(res.error);

    // Resumen
    const porc = res.resumen.cumplimiento;
    const comp = res.resumen.comision;
    document.getElementById('cumpl-porc').textContent     = formatPorc(porc);
    document.getElementById('cumpl-comision').textContent = formatMoney(comp);

    // Cards
    grid.innerHTML = '';
    res.kpis.forEach(kpi => {
      const porcVal = typeof kpi.porcCumpl === 'number' ? kpi.porcCumpl : parseFloat(kpi.porcCumpl) || 0;
      const color   = porcVal >= 1 ? '#00b894' : porcVal >= 0.7 ? '#fdcb6e' : '#e17055';
      const porcPct = Math.min(porcVal * 100, 100);

      const card = document.createElement('div');
      card.className = 'kpi-card';
      card.style.setProperty('--kpi-color', color);
      card.innerHTML = `
        <div class="kpi-card-id">${kpi.id || ''}</div>
        <div class="kpi-card-desc">${kpi.descripcion || ''}</div>
        <div class="kpi-card-val">${formatVal(kpi.real)}</div>
        <div class="kpi-card-meta">Meta: ${formatVal(kpi.meta)} · Peso: ${formatPorc(kpi.peso)}</div>
        <div class="kpi-progress-wrap">
          <div class="kpi-progress-track">
            <div class="kpi-progress-fill" style="width:${porcPct}%"></div>
          </div>
          <div class="kpi-progress-label">${formatPorc(porcVal)}</div>
        </div>
      `;
      grid.appendChild(card);
    });
  } catch(e) {
    grid.innerHTML = '<p style="color:var(--text-2);padding:20px">Error: ' + e.message + '</p>';
  }
}

document.getElementById('btn-refresh-kpis').addEventListener('click', cargarKPIs);

// ── FALTANTES ────────────────────────────────────────────
async function cargarFaltantes() {
  const wrap  = document.getElementById('faltantes-wrap');
  const gwrap = document.getElementById('gestion-wrap');
  wrap.innerHTML  = '<div class="loader-wrap"><div class="spinner"></div></div>';
  gwrap.innerHTML = '<div class="loader-wrap"><div class="spinner"></div></div>';
  try {
    const [rf, rg] = await Promise.all([get('getfaltantes'), get('getgestion')]);

    // Tabla faltantes
    if (rf.success && rf.faltantes.length > 0) {
      wrap.innerHTML = `<table class="data-table">
        <thead><tr><th>KPI</th><th>Falta p/100%</th><th>Falta p/150%</th><th>Falta p/250%</th></tr></thead>
        <tbody>${rf.faltantes.map(f => `<tr>
          <td><strong>${f.kpi}</strong></td>
          <td>${formatVal(f.falta100)}</td>
          <td>${formatVal(f.falta150)}</td>
          <td>${formatVal(f.falta250)}</td>
        </tr>`).join('')}</tbody>
      </table>`;
    } else {
      wrap.innerHTML = '<p style="color:var(--text-2);padding:20px">Sin datos de faltantes.</p>';
    }

    // Tabla gestión
    if (rg.success && rg.items.length > 0) {
      gwrap.innerHTML = `<table class="data-table">
        <thead><tr><th>Gestión</th><th>Entrada</th><th>Unidad</th><th>Subtotal</th><th>Resultado</th><th>Partida</th></tr></thead>
        <tbody>${rg.items.map(i => `<tr>
          <td>${i.gestion}</td>
          <td>${formatVal(i.entrada)}</td>
          <td>${formatVal(i.unidad)}</td>
          <td>${formatVal(i.subtotal)}</td>
          <td>${i.resultado !== '' ? formatVal(i.resultado) : ''}</td>
          <td>${i.partida   !== '' ? formatVal(i.partida)   : ''}</td>
        </tr>`).join('')}</tbody>
      </table>`;
    } else {
      gwrap.innerHTML = '<p style="color:var(--text-2);padding:20px">Sin datos de gestión.</p>';
    }
  } catch(e) {
    wrap.innerHTML  = '<p style="color:var(--text-2);padding:20px">Error: ' + e.message + '</p>';
    gwrap.innerHTML = '';
  }
}

// ── FORMULARIO VENTA ─────────────────────────────────────
async function initFormVenta() {
  // Cargar códigos para el select
  try {
    const res = await get('getreglasentradas');
    if (res.success) {
      reglasCache = res.reglas;
      const sel = document.getElementById('vf-codigo');
      res.reglas.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.codigoProducto;
        opt.textContent = r.codigoProducto + (r.nombrePlan ? ' — ' + r.nombrePlan : '');
        opt.dataset.regla = JSON.stringify(r);
        sel.appendChild(opt);
      });
      sel.addEventListener('change', () => {
        const opt = sel.options[sel.selectedIndex];
        if (opt.dataset.regla) {
          const r = JSON.parse(opt.dataset.regla);
          document.getElementById('vf-tipo-kpi').value      = r.tipoParrilla    || '';
          document.getElementById('vf-categoria').value     = r.categoria       || '';
          document.getElementById('vf-tipo-entrada').value  = r.tipoEntrada     || '';
        }
      });
    }
  } catch(_) {}

  // Fecha default = hoy
  document.getElementById('vf-fecha').valueAsDate = new Date();

  // Submit
  document.getElementById('venta-form').addEventListener('submit', async e => {
    e.preventDefault();
    const pwd = document.getElementById('vf-password').value;
    const msg = document.getElementById('vf-msg');
    const btn = document.getElementById('vf-submit');
    if (!pwd) { showMsg(msg, 'Ingresa la contraseña.', false); return; }

    btn.disabled    = true;
    btn.textContent = 'Guardando...';
    msg.textContent = '';
    msg.className   = 'form-msg';

    const form = e.target;
    const data = {
      fecha:           form.fecha.value,
      suscripcion:     form.suscripcion.value,
      aloha:           form.aloha.value,
      rut:             form.rut.value,
      nombreCompleto:  form.nombreCompleto.value,
      codigoProducto:  form.codigoProducto.value,
      tipoKPIPrincipal: document.getElementById('vf-tipo-kpi').value,
      categoriaRegla:  document.getElementById('vf-categoria').value,
      tipoEntradaRegla: document.getElementById('vf-tipo-entrada').value,
      cantidadVendida: form.cantidadVendida.value,
      orden:           form.orden.value,
      modeloEquipo:    form.modeloEquipo.value,
      valorEquipo:     form.valorEquipo.value,
      montoAccesorio:  form.montoAccesorio.value,
      nombreAccesorio: form.nombreAccesorio.value,
      rgu:             form.rgu.value,
      seguro:          form.seguro.checked,
      instalacionFO:   form.instalacionFO.checked
    };

    try {
      const res = await post('registrarVenta', { data, password: pwd });
      if (res.success) {
        showMsg(msg, '✅ ' + res.message, true);
        form.reset();
        document.getElementById('vf-fecha').valueAsDate = new Date();
        cargarUltimaVenta();
        toast('Venta registrada', 'ok');
      } else {
        showMsg(msg, '❌ ' + (res.error || 'Error desconocido'), false);
      }
    } catch(err) {
      showMsg(msg, '❌ ' + err.message, false);
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Registrar Venta';
    }
  });
}

// ── CÓDIGOS ──────────────────────────────────────────────
async function cargarTablacodigos() {
  const wrap = document.getElementById('codigos-tabla-wrap');
  wrap.innerHTML = '<div class="loader-wrap"><div class="spinner"></div></div>';
  try {
    const res = await get('getcodigos');
    if (!res.success || res.codigos.length === 0) {
      wrap.innerHTML = '<p style="color:var(--text-2);padding:20px">Sin códigos cargados.</p>';
      return;
    }
    wrap.innerHTML = `<table class="data-table">
      <thead><tr><th>Cod 3LF</th><th>Código Producto</th><th>Nombre Plan</th><th>Valor Entrada Equiv</th><th>Categoría</th></tr></thead>
      <tbody>${res.codigos.map(c => `<tr>
        <td style="opacity:0.6;font-size:0.78rem">${c.cod3lf || '—'}</td>
        <td><strong>${c.codigoProducto}</strong></td>
        <td>${c.nombrePlan || '—'}</td>
        <td>${c.valorEntradaEquiv}</td>
        <td><span class="badge badge-green">${c.categoria || '—'}</span></td>
      </tr>`).join('')}</tbody>
    </table>`;
  } catch(e) {
    wrap.innerHTML = '<p style="color:var(--text-2);padding:20px">Error: ' + e.message + '</p>';
  }
}

function initCodigos() {
  document.getElementById('cod-btn-actualizar').addEventListener('click', async () => {
    const codViejo = document.getElementById('cod-viejo').value.trim();
    const codNuevo = document.getElementById('cod-nuevo').value.trim();
    const valViejo = document.getElementById('val-viejo').value.trim();
    const valNuevo = document.getElementById('val-nuevo').value.trim();
    const pwd      = document.getElementById('cod-password').value;
    const msg      = document.getElementById('cod-msg');

    if (!codViejo || !codNuevo) { showMsg(msg, 'Ingresa el código viejo y el nuevo.', false); return; }
    if (!pwd) { showMsg(msg, 'Ingresa la contraseña.', false); return; }

    const btn = document.getElementById('cod-btn-actualizar');
    btn.disabled    = true;
    btn.textContent = 'Actualizando...';

    try {
      const res = await post('actualizarCodigo', {
        codigoViejo: codViejo,
        codigoNuevo: codNuevo,
        valorViejo:  valViejo || null,
        valorNuevo:  valNuevo || null,
        password:    pwd
      });
      if (res.success) {
        showMsg(msg, res.message, true);
        toast(res.message, 'ok');
        cargarTablacodigos();
      } else {
        showMsg(msg, '❌ ' + (res.error || 'Error'), false);
      }
    } catch(e) {
      showMsg(msg, '❌ ' + e.message, false);
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Actualizar →';
    }
  });
}

// ── PERSONALIZACIÓN ──────────────────────────────────────
function initPersonalizacion() {
  const inputAcento  = document.getElementById('pers-color-acento');
  const hexAcento    = document.getElementById('pers-color-acento-hex');
  const inputSidebar = document.getElementById('pers-color-sidebar');
  const hexSidebar   = document.getElementById('pers-color-sidebar-hex');
  const nombre       = document.getElementById('pers-nombre');
  const empresa      = document.getElementById('pers-empresa');

  // Sync color picker ↔ hex input
  inputAcento.addEventListener('input', () => { hexAcento.value = inputAcento.value; previewColors(); });
  hexAcento.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hexAcento.value)) { inputAcento.value = hexAcento.value; previewColors(); }
  });
  inputSidebar.addEventListener('input', () => { hexSidebar.value = inputSidebar.value; previewColors(); });
  hexSidebar.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hexSidebar.value)) { inputSidebar.value = hexSidebar.value; previewColors(); }
  });

  // Presets
  document.querySelectorAll('#presets-acento .color-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      inputAcento.value = btn.dataset.color;
      hexAcento.value   = btn.dataset.color;
      document.querySelectorAll('#presets-acento .color-preset').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      previewColors();
    });
  });
  document.querySelectorAll('#presets-sidebar .color-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      inputSidebar.value = btn.dataset.color;
      hexSidebar.value   = btn.dataset.color;
      document.querySelectorAll('#presets-sidebar .color-preset').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      previewColors();
    });
  });

  // Preview nombre
  nombre.addEventListener('input', () => {
    document.getElementById('preview-nombre').textContent = nombre.value || 'Nombre';
    document.getElementById('preview-avatar').textContent = (nombre.value[0] || 'E').toUpperCase();
  });
  empresa.addEventListener('input', () => {
    document.getElementById('preview-empresa').textContent = empresa.value || 'Empresa';
  });

  // Llenar con config actual
  if (configActual.colorPrimario)   { inputAcento.value  = configActual.colorPrimario;   hexAcento.value  = configActual.colorPrimario; }
  if (configActual.colorSecundario) { inputSidebar.value = configActual.colorSecundario; hexSidebar.value = configActual.colorSecundario; }
  if (configActual.nombreEjecutivo) { nombre.value  = configActual.nombreEjecutivo; document.getElementById('preview-nombre').textContent  = configActual.nombreEjecutivo; document.getElementById('preview-avatar').textContent = configActual.nombreEjecutivo[0].toUpperCase(); }
  if (configActual.nombreEmpresa)   { empresa.value = configActual.nombreEmpresa;   document.getElementById('preview-empresa').textContent = configActual.nombreEmpresa; }

  // Guardar
  document.getElementById('pers-btn-guardar').addEventListener('click', async () => {
    const pwd = document.getElementById('pers-password').value;
    const msg = document.getElementById('pers-msg');
    const btn = document.getElementById('pers-btn-guardar');
    if (!pwd) { showMsg(msg, 'Ingresa la contraseña admin.', false); return; }

    btn.disabled    = true;
    btn.textContent = 'Guardando...';
    try {
      const res = await post('guardarConfig', {
        password: pwd,
        config: {
          colorPrimario:    inputAcento.value,
          colorSecundario:  inputSidebar.value,
          nombreEjecutivo:  nombre.value,
          nombreEmpresa:    empresa.value
        }
      });
      if (res.success) {
        aplicarConfig(res.config);
        showMsg(msg, '✅ Configuración guardada.', true);
        toast('Configuración guardada', 'ok');
      } else {
        showMsg(msg, '❌ ' + (res.error || 'Error'), false);
      }
    } catch(e) {
      showMsg(msg, '❌ ' + e.message, false);
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Guardar cambios →';
    }
  });
}

function previewColors() {
  const acento  = document.getElementById('pers-color-acento').value;
  const sidebar = document.getElementById('pers-color-sidebar').value;
  document.documentElement.style.setProperty('--accent', acento);
  document.documentElement.style.setProperty('--accent-dark', darken(acento, 15));
  document.documentElement.style.setProperty('--sidebar-bg', sidebar);
  document.getElementById('preview-avatar').style.background = acento;
}

// ── GALERÍA ──────────────────────────────────────────────
function initGaleria() {
  const input  = document.getElementById('galeria-input');
  const btnUp  = document.getElementById('btn-subir-foto');
  const btnDel = document.getElementById('galeria-del-btn');

  btnUp.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const pwd = prompt('Contraseña admin:');
    if (!pwd) return;
    if (btoa(pwd) !== btoa('Admin2025')) { toast('Contraseña incorrecta', 'err'); return; }
    await subirFoto(file);
    input.value = '';
  });

  btnDel.addEventListener('click', async () => {
    if (!galeriaFotos[galeriaIdx]) return;
    const pwd = prompt('Contraseña admin:');
    if (!pwd || btoa(pwd) !== btoa('Admin2025')) { toast('Contraseña incorrecta', 'err'); return; }
    await eliminarFoto(galeriaFotos[galeriaIdx].fileName);
  });

  document.getElementById('galeria-main').addEventListener('click', () => {
    if (galeriaFotos[galeriaIdx]) openFullscreen(galeriaFotos[galeriaIdx].url);
  });

  cargarGaleria();
}

async function cargarGaleria() {
  const thumbs = document.getElementById('galeria-thumbs');
  const empty  = document.getElementById('galeria-empty');
  const main   = document.getElementById('galeria-main');
  const btnDel = document.getElementById('galeria-del-btn');
  thumbs.innerHTML = Array(4).fill('<div class="galeria-thumb-skel"></div>').join('');

  try {
    const url  = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_BUCKET}/o?prefix=${encodeURIComponent(GALERIA_FOLDER)}&delimiter=/`;
    const res  = await fetch(url);
    const data = await res.json();
    const items = (data.items || []).filter(i => !i.name.endsWith('/'));

    galeriaFotos = items.map(i => ({
      fileName: i.name,
      url: `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_BUCKET}/o/${encodeURIComponent(i.name)}?alt=media`
    }));

    thumbs.innerHTML = '';
    if (galeriaFotos.length === 0) {
      empty.style.display = 'flex';
      main.style.display  = 'none';
      btnDel.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    galeriaFotos.forEach((f, i) => {
      const img = document.createElement('img');
      img.src = f.url; img.className = 'galeria-thumb'; img.alt = 'Foto ' + (i+1);
      img.addEventListener('click', () => setFotoActiva(i));
      thumbs.appendChild(img);
    });
    setFotoActiva(0);
  } catch(_) { thumbs.innerHTML = ''; }
}

function setFotoActiva(idx) {
  galeriaIdx = idx;
  const main   = document.getElementById('galeria-main');
  const btnDel = document.getElementById('galeria-del-btn');
  main.src = galeriaFotos[idx].url;
  main.style.display = 'block';
  document.getElementById('galeria-empty').style.display = 'none';
  btnDel.style.display = 'flex';
  document.querySelectorAll('.galeria-thumb').forEach((t,i) => t.classList.toggle('active', i === idx));
}

async function subirFoto(file) {
  const btn = document.getElementById('btn-subir-foto');
  btn.textContent = 'Subiendo...';
  btn.disabled    = true;
  try {
    const ext = file.name.split('.').pop();
    const fn  = GALERIA_FOLDER + 'foto_' + Date.now() + '.' + ext;
    const upUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_BUCKET}/o/${encodeURIComponent(fn)}?uploadType=media`;
    const res = await fetch(upUrl, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
    if (!res.ok) throw new Error('Error al subir');
    toast('Foto subida', 'ok');
    await cargarGaleria();
  } catch(e) { toast('Error: ' + e.message, 'err'); }
  finally { btn.textContent = 'Subir foto'; btn.disabled = false; }
}

async function eliminarFoto(fileName) {
  try {
    const url = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_BUCKET}/o/${encodeURIComponent(fileName)}`;
    await fetch(url, { method: 'DELETE' });
    toast('Foto eliminada', 'ok');
    await cargarGaleria();
  } catch(e) { toast('Error: ' + e.message, 'err'); }
}

// ── FULLSCREEN ───────────────────────────────────────────
function openFullscreen(src) {
  document.getElementById('fullscreen-img').src = src;
  document.getElementById('fullscreen-overlay').classList.add('open');
}
document.getElementById('fullscreen-close').addEventListener('click', () => {
  document.getElementById('fullscreen-overlay').classList.remove('open');
});
document.getElementById('fullscreen-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('fullscreen-overlay').classList.remove('open');
});

// ── HELPERS ──────────────────────────────────────────────
async function get(action) {
  const res  = await fetch(APPS_SCRIPT_URL + '?action=' + action, { cache: 'no-cache' });
  return res.json();
}

async function post(action, body) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    cache:  'no-cache',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...body })
  });
  return res.json();
}

function showMsg(el, text, ok) {
  el.textContent = text;
  el.className   = 'form-msg ' + (ok ? 'ok' : 'err');
  setTimeout(() => { el.textContent = ''; el.className = 'form-msg'; }, 5000);
}

function toast(text, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = text;
  document.getElementById('toast-container').appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3500);
}

function formatVal(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') {
    if (v === 0) return '0';
    if (Math.abs(v) >= 1000) return '$' + v.toLocaleString('es-CL');
    return v % 1 === 0 ? v.toString() : v.toFixed(1);
  }
  return v.toString();
}

function formatPorc(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return (v * 100).toFixed(0) + '%';
  if (typeof v === 'string' && v.includes('%')) return v;
  return v + '%';
}

function formatMoney(v) {
  if (!v) return '$0';
  return '$' + Math.round(v).toLocaleString('es-CL');
}

function darken(hex, pct) {
  const n   = parseInt(hex.replace('#',''), 16);
  const r   = Math.max(0, (n >> 16) - pct);
  const g   = Math.max(0, ((n >> 8) & 0xFF) - pct);
  const b   = Math.max(0, (n & 0xFF) - pct);
  return '#' + [r,g,b].map(c => c.toString(16).padStart(2,'0')).join('');
}
