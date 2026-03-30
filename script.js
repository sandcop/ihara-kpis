// ── CONFIG ──────────────────────────────────────────────
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbylXxEk_2ydD4gdeOKwYnQOdpGyvbxcYO_cpFdEGUmpGd3qfm_gUkMrzUA_5w32XLF0/exec';
const FIREBASE_BUCKET = 'seguimiento-ventas-manuel.firebasestorage.app'; // ← o el del cliente
const GALERIA_FOLDER = 'galeria_v2/';
const PASS_KEY = btoa('Ventas2025'); // contraseña de ventas (sync con Config.gs)

// ── STATE ────────────────────────────────────────────────
let galeriaFotos = [];
let galeriaIdx = 0;
let reglasCache = [];
let configActual = {};

// ── AUTH ─────────────────────────────────────────────────
function isAuth() { return sessionStorage.getItem('auth') === '1'; }
function setAuth() { sessionStorage.setItem('auth', '1'); }

document.getElementById('login-btn').addEventListener('click', doLogin);
document.getElementById('login-input').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

function doLogin() {
  const pwd = document.getElementById('login-input').value.trim();
  const err = document.getElementById('login-error');
  if (btoa(pwd) === PASS_KEY || pwd === 'Admin2025') {
    setAuth();
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
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
  cargarUltimaVenta();
  initFormVenta();
  initCodigos();
  initPersonalizacion();
  initAceleradoresControls();
  initCerrarMes();
  updateTime();
  setInterval(updateTime, 30000);
  navigateTo('inicio');
}

// ── CONFIG / PERSONALIZACIÓN ─────────────────────────────
async function cargarConfig() {
  try {
    const res = await get('getconfig');
    if (res.success) aplicarConfig(res.config);
  } catch (_) { }
}

function aplicarConfig(config) {
  configActual = config;
  const root = document.documentElement;
  if (config.colorPrimario) { root.style.setProperty('--accent', config.colorPrimario); root.style.setProperty('--accent-dark', darken(config.colorPrimario, 15)); }
  if (config.colorSecundario) { root.style.setProperty('--sidebar-bg', config.colorSecundario); }
  if (config.nombreEjecutivo) {
    document.getElementById('user-name').textContent = config.nombreEjecutivo;
    document.getElementById('user-avatar').textContent = config.nombreEjecutivo[0].toUpperCase();
    document.getElementById('sidebar-brand-name').textContent = config.nombreEmpresa || 'Dashboard';
  }
  // Greeting
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  document.getElementById('greeting-text').textContent = saludo + (config.nombreEjecutivo ? ', ' + config.nombreEjecutivo : '') + ' 👋';
  document.getElementById('mobile-title').textContent = config.nombreEmpresa || 'Dashboard';
}

// ── NAVEGACIÓN ───────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      if (item.id === 'nav-cerrar-mes') return; // Handled separately
      e.preventDefault();
      const sec = item.dataset.section;
      if (sec) {
          navigateTo(sec);
          closeSidebar();
      }
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
  if (sec === 'kpis') { cargarKPIs(); cargarAceleradores(); }
  if (sec === 'metas') cargarMetas();
  if (sec === 'faltantes') cargarFaltantes();
  if (sec === 'codigos') cargarTablacodigos();
}

function openSidebar() { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebar-overlay').classList.add('visible'); }
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
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('user-time').textContent = h + ':' + m;
}

// ── ÚLTIMA VENTA ─────────────────────────────────────────
async function cargarUltimaVenta() {
  try {
    const res = await get('getultimaventa');
    if (res.success && res.data) {
      document.getElementById('ultima-venta-nombre').textContent = res.data.nombre || '—';
      document.getElementById('ultima-venta-meta').textContent =
        (res.data.producto || '—') + ' · Orden: ' + (res.data.orden || '—') + ' · ' + (res.data.fecha || '—');
    }
  } catch (_) { }
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
    document.getElementById('cumpl-porc').textContent = formatPorc(porc);
    document.getElementById('cumpl-comision').textContent = formatMoney(res.resumen.factorPPM || comp);

    // Cards
    grid.innerHTML = '';
    res.kpis.forEach(kpi => {
      const porcVal = typeof kpi.porcCumpl === 'number' ? kpi.porcCumpl : parseFloat(String(kpi.porcCumpl).replace('%', '')) / 100 || 0;
      const color = porcVal >= 1.5 ? '#6c5ce7' : porcVal >= 1 ? '#00b894' : porcVal >= 0.7 ? '#fdcb6e' : '#e17055';
      const porcPct = Math.min(porcVal * 100, 100);
      const tieneAporte = kpi.peso && kpi.peso !== '';

      const card = document.createElement('div');
      card.className = 'kpi-card';
      card.style.setProperty('--kpi-color', color);
      // ISN y NBA tienen valores porcentuales (0.9 = 90%, 0.85 = 85%)
      const esPorc = ['ISN', 'ADHESION_NBA'].includes(kpi.id);
      
      // Proyección Fin de Mes
      let proyeccionHtml = '';
      if (typeof kpi.real === 'number' && typeof kpi.meta === 'number' && kpi.meta > 0 && !esPorc) {
          const hoy = new Date();
          const diaActual = Math.max(1, hoy.getDate());
          const totalDias = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
          const proyNum = (kpi.real / diaActual) * totalDias;
          proyeccionHtml = `<div style="font-size:0.75rem; color:var(--text-2); margin-top:8px; border-top:1px solid var(--border); padding-top:6px;">Proy. Fin de Mes: <strong style="color:var(--text-1)">${formatVal(proyNum)}</strong></div>`;
      }

      // Botón + para TERMINALES
      const btnTerminales = kpi.id === 'TERMINALES' ? `<button class="btn-sm btn-ghost kpi-detail-btn" data-kpi="${kpi.id}" style="margin-top:8px;font-size:0.72rem">+ Ver modelos</button>` : '';
      // Botón + para FO_TERMINADA
      const btnFO = kpi.id === 'FO_TERMINADA' ? `<button class="btn-sm btn-ghost kpi-detail-btn" data-kpi="${kpi.id}" style="margin-top:8px;font-size:0.72rem">+ Ver instalaciones</button>` : '';
      card.innerHTML = `
        <div class="kpi-card-id">${kpi.id || ''}</div>
        <div class="kpi-card-desc">${kpi.descripcion || ''}</div>
        <div class="kpi-card-val">${esPorc ? formatVal(kpi.real, true) : formatVal(kpi.real)}</div>
        <div class="kpi-card-meta">Meta: ${esPorc ? formatVal(kpi.meta, true) : formatVal(kpi.meta)}${tieneAporte ? ' · Peso: ' + formatPorc(kpi.peso) : ''}</div>
        ${tieneAporte ? `<div class="kpi-progress-wrap">
          <div class="kpi-progress-track"><div class="kpi-progress-fill" style="width:${porcPct}%"></div></div>
          <div class="kpi-progress-label">${formatPorc(porcVal)}${kpi.aporte ? ' · Aporte: ' + formatPorc(kpi.aporte) : ''}</div>
        </div>` : `<div class="kpi-progress-wrap">
          <div class="kpi-progress-track"><div class="kpi-progress-fill" style="width:${porcPct}%"></div></div>
          <div class="kpi-progress-label">${formatPorc(porcVal)}</div>
        </div>`}
        ${proyeccionHtml}
        ${btnTerminales}${btnFO}
      `;
      grid.appendChild(card);
    });
  } catch (e) {
    grid.innerHTML = '<p style="color:var(--text-2);padding:20px">Error: ' + e.message + '</p>';
  }
}

document.getElementById('btn-refresh-kpis').addEventListener('click', () => { cargarKPIs(); cargarAceleradores(); });


// ── ACELERADORES ─────────────────────────────────────────
async function cargarAceleradores() {
  const grid = document.getElementById('acel-grid');
  const totalWrap = document.getElementById('acel-total-wrap');
  if (!grid) return;
  grid.innerHTML = '<div class="loader-wrap"><div class="spinner"></div></div>';

  try {
    const res = await get('getaceleradores');
    if (!res.success) throw new Error(res.error);

    const aList = res.aceleradores || [];
    const colores = ['#6c5ce7', '#0984e3', '#e17055', '#00b894', '#fdcb6e', '#e84393'];

    grid.innerHTML = '';
    aList.forEach((item, idx) => {
      // Si el evaluado está vacío, mejor no mostrar la tarjeta
      if (!item.valorEvaluado && !item.formulaOTexto) return;
      
      const color = colores[idx % colores.length];
      const card = document.createElement('div');
      card.className = 'acel-card';
      card.style.setProperty('--acel-color', color);

      // Header con título + botón ocultar
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';

      const titulo = document.createElement('div');
      titulo.className = 'acel-card-title';
      titulo.style.marginBottom = '0';
      titulo.textContent = item.titulo || 'Acelerador';

      const btnOc = document.createElement('button');
      const iconEye = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
      const iconEyeOff = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
      
      btnOc.innerHTML = iconEye;
      btnOc.title = 'Ocultar';
      btnOc.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--text-2);padding:0;display:flex;align-items:center;flex-shrink:0;margin-left:8px;';

      const body = document.createElement('div');
      body.className = 'acel-card-msg';
      body.textContent = item.valorEvaluado || '';

      btnOc.addEventListener('click', () => {
        const oculto = body.style.display === 'none';
        body.style.display = oculto ? '' : 'none';
        btnOc.innerHTML = oculto ? iconEye : iconEyeOff;
        btnOc.title = oculto ? 'Ocultar' : 'Mostrar';
      });

      header.appendChild(titulo);
      header.appendChild(btnOc);
      card.appendChild(header);
      card.appendChild(body);
      grid.appendChild(card);
    });

    if (totalWrap) totalWrap.style.display = 'none';

  } catch (e) {
    grid.innerHTML = '<p style="color:var(--text-2);padding:20px">Error cargando aceleradores: ' + e.message + '</p>';
  }
}

// ── FALTANTES ────────────────────────────────────────────
async function cargarFaltantes() {
  const wrap = document.getElementById('faltantes-wrap');
  const gwrap = document.getElementById('gestion-wrap');
  wrap.innerHTML = '<div class="loader-wrap"><div class="spinner"></div></div>';
  gwrap.innerHTML = '<div class="loader-wrap"><div class="spinner"></div></div>';
  try {
    // Todo viene en un solo endpoint: faltantes + gestion
    const res = await get('getfaltantes');

    // Tabla faltantes
    if (res.success && res.faltantes && res.faltantes.length > 0) {
      wrap.innerHTML = `<table class="data-table">
        <thead><tr><th>KPI</th><th>Falta p/100%</th><th>Falta p/150%</th><th>Falta p/250%</th></tr></thead>
        <tbody>${res.faltantes.map(f => `<tr>
          <td><strong>${f.kpi}</strong></td>
          <td>${formatVal(f.falta100, false, true)}</td>
          <td>${formatVal(f.falta150, false, true)}</td>
          <td>${formatVal(f.falta250, false, true)}</td>
        </tr>`).join('')}</tbody>
      </table>`;
    } else {
      wrap.innerHTML = '<p style="color:var(--text-2);padding:20px">Sin datos de faltantes.</p>';
    }

    // Tabla gestión — viene como res.gestion (del mismo endpoint)
    const gestion = res.gestion || [];
    if (gestion.length > 0) {
      gwrap.innerHTML = `<table class="data-table">
        <thead><tr><th>Gestión</th><th>Entrada</th><th>Unidad</th><th>Subtotal</th><th>Resultado</th><th>Partida</th></tr></thead>
        <tbody>${gestion.map(i => `<tr>
          <td>${i.gestion}</td>
          <td>${formatVal(i.entrada, false, true)}</td>
          <td>
             <input type="number" step="any" class="input-unidad-gestion" data-fila="${i.filaEnSheet}" value="${i.unidad !== '' && i.unidad !== undefined ? i.unidad : ''}" style="width:60px; padding:4px; text-align:center; background:var(--bg-alt); border:1px solid var(--border); color:inherit; border-radius:4px;">
          </td>
          <td>${formatVal(i.subtotal, false, true)}</td>
          <td>${i.resultado !== '' && i.resultado !== undefined ? formatVal(i.resultado, false, true) : ''}</td>
          <td>${i.partida !== '' && i.partida !== undefined ? formatVal(i.partida, false, true) : ''}</td>
        </tr>`).join('')}</tbody>
      </table>`;

      gwrap.querySelectorAll('.input-unidad-gestion').forEach(inp => {
        inp.addEventListener('change', async (e) => {
           const fila = e.target.dataset.fila;
           const val = e.target.value;
           
           const pwd = prompt('Ingresa la contraseña admin para confirmar modificación:');
           if (!pwd) {
               cargarFaltantes(); // revert
               return; 
           }
           
           try {
               toast('Guardando unidad...', 'ok');
               e.target.disabled = true;
               const resPost = await post('actualizarunidadgestion', { fila: parseInt(fila), valor: val, password: pwd });
               if (resPost.success) {
                   toast('Unidad actualizada en Sheets', 'ok');
                   cargarFaltantes();
               } else {
                   alert('Error al guardar: ' + resPost.error);
                   cargarFaltantes();
               }
           } catch (err) {
               alert('Error de conexión');
               cargarFaltantes();
           }
        });
      });

    } else {
      gwrap.innerHTML = '<p style="color:var(--text-2);padding:20px">Sin datos de gestión.</p>';
    }
  } catch (e) {
    wrap.innerHTML = '<p style="color:var(--text-2);padding:20px">Error: ' + e.message + '</p>';
    gwrap.innerHTML = '';
  }
}

// ── FORMULARIO VENTA ─────────────────────────────────────
async function initFormVenta() {
  try {
    const res = await get('getreglasentradas');
    if (res.success) reglasCache = res.reglas;
  } catch (_) { }

  const selCategoria = document.getElementById('vf-categoria');
  const selCod = document.getElementById('vf-codigo');
  const selEntrada = document.getElementById('vf-tipo-entrada');
  const inpCantidad = document.getElementById('vf-cantidad');
  const inpEquivUnit = document.getElementById('vf-entradas-unit');
  const inpEquivTot = document.getElementById('vf-entradas-total');
  const selTipoKPI = document.getElementById('vf-tipo-kpi');

  function poblarSelect(sel, opciones, placeholder) {
    sel.innerHTML = `<option value="">${placeholder}</option>`;
    opciones.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = v;
      sel.appendChild(opt);
    });
  }

  function filtrarPorCategoria() {
    const cat = selCategoria.value.trim().toLowerCase();
    const kpi = selTipoKPI.value;
    inpEquivUnit.value = ''; inpEquivTot.value = '';
    
    if (kpi === 'VOZ_MOVIL') {
        const codigosVoz = ['Cod_3NA', 'Cod_3LN', 'Cod_3LM', 'Cod_3JB'];
        const entradasVoz = ['Alta Normal', 'Portada Prepago', 'Portada Postpago', 'Alta Totalización', 'Porta Pre Totalizada', 'Porta Post Totalizada', 'Alta Completación', 'Porta Pre Completación', 'Porta Post Completación'];
        poblarSelect(selCod, codigosVoz, '— Selecciona código —');
        poblarSelect(selEntrada, entradasVoz, '— Selecciona tipo entrada —');
        return;
    }

    if (kpi === 'MIGRACIÓN') {
        poblarSelect(selCod, ['Cod_Migracion'], '— Selecciona código —');
        poblarSelect(selEntrada, ['Alta Migrada'], '— Selecciona tipo entrada —');
        return;
    }

    if (kpi === 'PPT') {
        poblarSelect(selCod, ['Cod_PPT'], '— Selecciona código —');
        poblarSelect(selEntrada, ['Alta Ppt'], '— Selecciona tipo entrada —');
        return;
    }

    if (!cat) {
      poblarSelect(selCod, [], '— Selecciona categoría primero —');
      poblarSelect(selEntrada, [], '— Selecciona categoría primero —');
      return;
    }
    // Comparación case-insensitive para tolerar "Accesorios" vs "ACCESORIOS"
    const reglasCategoria = reglasCache.filter(r =>
      (r.categoria || '').toString().trim().toLowerCase() === cat
    );
    const codigos = [...new Set(reglasCategoria.map(r => r.codigoProducto).filter(Boolean))];
    const entradas = [...new Set(reglasCategoria.map(r => r.tipoEntrada).filter(Boolean))];
    poblarSelect(selCod, codigos, codigos.length ? '— Selecciona código —' : '— Sin opciones —');
    poblarSelect(selEntrada, entradas, entradas.length ? '— Selecciona tipo entrada —' : '— Sin opciones —');
  }

  function filtrarEntradasPorCodigo() {
    const cat = selCategoria.value.trim().toLowerCase();
    const codigo = selCod.value;
    const kpi = selTipoKPI.value;
    inpEquivUnit.value = ''; inpEquivTot.value = '';
    
    if (kpi === 'VOZ_MOVIL') {
        const entradasVoz = ['Alta Normal', 'Portada Prepago', 'Portada Postpago', 'Alta Totalización', 'Porta Pre Totalizada', 'Porta Post Totalizada', 'Alta Completación', 'Porta Pre Completación', 'Porta Post Completación'];
        poblarSelect(selEntrada, entradasVoz, '— Selecciona tipo entrada —');
        return;
    }

    if (kpi === 'MIGRACIÓN') {
        poblarSelect(selEntrada, ['Alta Migrada'], '— Selecciona tipo entrada —');
        return;
    }

    if (kpi === 'PPT') {
        poblarSelect(selEntrada, ['Alta Ppt'], '— Selecciona tipo entrada —');
        return;
    }

    if (!cat || !codigo) return;
    const entradas = [...new Set(
      reglasCache
        .filter(r => (r.categoria || '').trim().toLowerCase() === cat && r.codigoProducto === codigo)
        .map(r => r.tipoEntrada).filter(Boolean)
    )];
    poblarSelect(selEntrada, entradas, entradas.length ? '— Selecciona tipo entrada —' : '— Sin opciones —');
  }

  function buscarEntradasEquiv() {
    const codigo = selCod.value.trim();
    const entrada = selEntrada.value.trim();
    if (!codigo || !entrada) { inpEquivUnit.value = ''; inpEquivTot.value = ''; return; }
    const regla = reglasCache.find(r => r.codigoProducto === codigo && r.tipoEntrada === entrada);
    if (regla && regla.valorEntradaEquiv !== '' && regla.valorEntradaEquiv !== null) {
      const valUnit = parseFloat(regla.valorEntradaEquiv) || 0;
      const cant = parseFloat(inpCantidad.value) || 1;
      inpEquivUnit.value = valUnit;
      inpEquivTot.value = (valUnit * cant).toFixed(2);
    } else {
      inpEquivUnit.value = ''; inpEquivTot.value = '';
    }
  }

  selTipoKPI.addEventListener('change', filtrarPorCategoria);
  selCategoria.addEventListener('change', filtrarPorCategoria);
  selCod.addEventListener('change', () => { filtrarEntradasPorCodigo(); buscarEntradasEquiv(); });
  selEntrada.addEventListener('change', buscarEntradasEquiv);
  inpCantidad.addEventListener('input', buscarEntradasEquiv);

  // Inicializar selects vacíos
  poblarSelect(selCod, [], '— Selecciona categoría primero —');
  poblarSelect(selEntrada, [], '— Selecciona categoría primero —');

  document.getElementById('vf-fecha').valueAsDate = new Date();

  document.getElementById('venta-form').addEventListener('submit', async e => {
    e.preventDefault();
    const pwd = document.getElementById('vf-password').value;
    const msg = document.getElementById('vf-msg');
    const btn = document.getElementById('vf-submit');
    if (!pwd) { showMsg(msg, 'Ingresa la contraseña.', false); return; }

    btn.disabled = true;
    btn.textContent = 'Guardando...';
    msg.textContent = '';
    msg.className = 'form-msg';

    const form = e.target;
    const data = {
      fecha: form.fecha.value,
      suscripcion: form.suscripcion.value,
      aloha: form.aloha.value,
      rut: form.rut.value,
      nombreCompleto: form.nombreCompleto.value,
      codigoProducto: form.codigoProducto.value,
      tipoKPIPrincipal: document.getElementById('vf-tipo-kpi').value,
      categoriaRegla: document.getElementById('vf-categoria').value,
      tipoEntradaRegla: document.getElementById('vf-tipo-entrada').value,
      cantidadVendida: form.cantidadVendida.value,
      entradasEquivUnit: document.getElementById('vf-entradas-unit').value,
      totalEntradas: document.getElementById('vf-entradas-total').value,
      orden: form.orden.value,
      modeloEquipo: form.modeloEquipo.value,
      valorEquipo: form.valorEquipo.value,
      montoAccesorio: form.montoAccesorio.value,
      nombreAccesorio: form.nombreAccesorio.value,
      rgu: form.rgu.value,
      seguro: form.seguro.checked,
      instalacionFO: form.instalacionFO.checked
    };

    try {
      const res = await post('registrarVenta', { data, password: pwd });
      if (res.success) {
        showMsg(msg, '✅ ' + res.message, true);
        form.reset();
        document.getElementById('vf-fecha').valueAsDate = new Date();
        poblarSelect(selCod, [], '— Selecciona categoría primero —');
        poblarSelect(selEntrada, [], '— Selecciona categoría primero —');
        inpEquivUnit.value = ''; inpEquivTot.value = '';
        cargarUltimaVenta();
        toast('Venta registrada', 'ok');
      } else {
        showMsg(msg, '❌ ' + (res.error || 'Error desconocido'), false);
      }
    } catch (err) {
      showMsg(msg, '❌ ' + err.message, false);
    } finally {
      btn.disabled = false;
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
  } catch (e) {
    wrap.innerHTML = '<p style="color:var(--text-2);padding:20px">Error: ' + e.message + '</p>';
  }
}

function initCodigos() {
  document.getElementById('cod-btn-actualizar').addEventListener('click', async () => {
    const codViejo = document.getElementById('cod-viejo').value.trim();
    const codNuevo = document.getElementById('cod-nuevo').value.trim();
    const valViejo = document.getElementById('val-viejo').value.trim();
    const valNuevo = document.getElementById('val-nuevo').value.trim();
    const pwd = document.getElementById('cod-password').value;
    const msg = document.getElementById('cod-msg');

    if (!codViejo || !codNuevo) { showMsg(msg, 'Ingresa el código viejo y el nuevo.', false); return; }
    if (!pwd) { showMsg(msg, 'Ingresa la contraseña.', false); return; }

    const btn = document.getElementById('cod-btn-actualizar');
    btn.disabled = true;
    btn.textContent = 'Actualizando...';

    try {
      const res = await post('actualizarCodigo', {
        codigoViejo: codViejo,
        codigoNuevo: codNuevo,
        valorViejo: valViejo || null,
        valorNuevo: valNuevo || null,
        password: pwd
      });
      if (res.success) {
        showMsg(msg, res.message, true);
        toast(res.message, 'ok');
        cargarTablacodigos();
      } else {
        showMsg(msg, '❌ ' + (res.error || 'Error'), false);
      }
    } catch (e) {
      showMsg(msg, '❌ ' + e.message, false);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Actualizar →';
    }
  });
}

// ── PERSONALIZACIÓN ──────────────────────────────────────
function initPersonalizacion() {
  const inputAcento = document.getElementById('pers-color-acento');
  const hexAcento = document.getElementById('pers-color-acento-hex');
  const inputSidebar = document.getElementById('pers-color-sidebar');
  const hexSidebar = document.getElementById('pers-color-sidebar-hex');
  const nombre = document.getElementById('pers-nombre');
  const empresa = document.getElementById('pers-empresa');

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
      hexAcento.value = btn.dataset.color;
      document.querySelectorAll('#presets-acento .color-preset').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      previewColors();
    });
  });
  document.querySelectorAll('#presets-sidebar .color-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      inputSidebar.value = btn.dataset.color;
      hexSidebar.value = btn.dataset.color;
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
  if (configActual.colorPrimario) { inputAcento.value = configActual.colorPrimario; hexAcento.value = configActual.colorPrimario; }
  if (configActual.colorSecundario) { inputSidebar.value = configActual.colorSecundario; hexSidebar.value = configActual.colorSecundario; }
  if (configActual.nombreEjecutivo) { nombre.value = configActual.nombreEjecutivo; document.getElementById('preview-nombre').textContent = configActual.nombreEjecutivo; document.getElementById('preview-avatar').textContent = configActual.nombreEjecutivo[0].toUpperCase(); }
  if (configActual.nombreEmpresa) { empresa.value = configActual.nombreEmpresa; document.getElementById('preview-empresa').textContent = configActual.nombreEmpresa; }

  // Guardar
  document.getElementById('pers-btn-guardar').addEventListener('click', async () => {
    const pwd = document.getElementById('pers-password').value;
    const msg = document.getElementById('pers-msg');
    const btn = document.getElementById('pers-btn-guardar');
    if (!pwd) { showMsg(msg, 'Ingresa la contraseña admin.', false); return; }

    btn.disabled = true;
    btn.textContent = 'Guardando...';
    try {
      const res = await post('guardarConfig', {
        password: pwd,
        config: {
          colorPrimario: inputAcento.value,
          colorSecundario: inputSidebar.value,
          nombreEjecutivo: nombre.value,
          nombreEmpresa: empresa.value
        }
      });
      if (res.success) {
        aplicarConfig(res.config);
        showMsg(msg, '✅ Configuración guardada.', true);
        toast('Configuración guardada', 'ok');
      } else {
        showMsg(msg, '❌ ' + (res.error || 'Error'), false);
      }
    } catch (e) {
      showMsg(msg, '❌ ' + e.message, false);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar cambios →';
    }
  });
}

function previewColors() {
  const acento = document.getElementById('pers-color-acento').value;
  const sidebar = document.getElementById('pers-color-sidebar').value;
  document.documentElement.style.setProperty('--accent', acento);
  document.documentElement.style.setProperty('--accent-dark', darken(acento, 15));
  document.documentElement.style.setProperty('--sidebar-bg', sidebar);
  document.getElementById('preview-avatar').style.background = acento;
}


async function get(action) {
  const res = await fetch(APPS_SCRIPT_URL + '?action=' + action, { cache: 'no-cache' });
  return res.json();
}

async function post(action, body) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    cache: 'no-cache',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...body })
  });
  return res.json();
}

function showMsg(el, text, ok) {
  el.textContent = text;
  el.className = 'form-msg ' + (ok ? 'ok' : 'err');
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

function formatVal(v, esPorc = false, forzarNumero = false) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') {
    if (v === 0) return '0';
    if (Math.abs(v) >= 1000) return '$' + v.toLocaleString('es-CL');
    // Si es porcentaje (entre 0 y 2, con decimales) mostrar como %
    if (esPorc || (!forzarNumero && v > 0 && v <= 2 && v % 1 !== 0)) return (v * 100).toFixed(0) + '%';
    return v % 1 === 0 ? v.toString() : v.toFixed(1);
  }
  if (typeof v === 'string' && v.includes('%')) return v;
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
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (n >> 16) - pct);
  const g = Math.max(0, ((n >> 8) & 0xFF) - pct);
  const b = Math.max(0, (n & 0xFF) - pct);
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

// ── METAS ────────────────────────────────────────────────
async function cargarMetas() {
  const wrap = document.getElementById('metas-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="loader-wrap"><div class="spinner"></div></div>';
  try {
    const res = await get('getmetas');
    if (!res.success) throw new Error(res.error);

    wrap.innerHTML = '';
    res.metas.forEach(m => {
      let isFractional = false;
      let displayMeta = m.meta;
      
      const isPorcType = m.tipoMeta && m.tipoMeta.toString().toLowerCase() === 'porcentaje';
      if (isPorcType && typeof m.meta === 'number' && m.meta > 0 && m.meta <= 1.2) {
          isFractional = true;
          displayMeta = (m.meta * 100) + '%';
      }
      
      const row = document.createElement('div');
      row.className = 'meta-row';

      let partidaHtml = '';
      if (m.kpiId.trim().toUpperCase() === 'GESTION DE VALOR') {
          partidaHtml = `
            <input class="meta-input meta-partida-input" type="number" step="any" value="${res.partidaGV || ''}" data-kpi="${m.kpiId}" placeholder="Partida" style="margin-left:8px;width:80px">
            <span class="meta-tipo" style="margin-left:4px;margin-right:4px">Partida</span>
          `;
      }

      row.innerHTML = `
        <div class="meta-info">
          <span class="meta-id">${m.kpiId}</span>
          <span class="meta-desc">${m.descripcion || ''}</span>
        </div>
        <div class="meta-edit">
          <input class="meta-input" type="text" value="${displayMeta}" data-kpi="${m.kpiId}" placeholder="Meta">
          <span class="meta-tipo">${m.tipoMeta || ''}</span>
          ${partidaHtml}
          <span class="meta-peso" style="margin-left:8px">${typeof m.pesoPPM === 'number' ? (m.pesoPPM * 100).toFixed(0) + '%' : (m.pesoPPM || '')}</span>
        </div>
      `;
      wrap.appendChild(row);
    });

    // Botón guardar todas
    const btnWrap = document.createElement('div');
    btnWrap.className = 'form-actions';
    btnWrap.style.marginTop = '20px';
    btnWrap.innerHTML = `
      <div class="field" style="flex:1;max-width:260px">
        <label>Contraseña admin</label>
        <input type="password" id="metas-password" placeholder="Contraseña">
      </div>
      <button class="btn-accent" id="metas-guardar-btn">Guardar metas →</button>
      <p class="form-msg" id="metas-msg"></p>
    `;
    wrap.appendChild(btnWrap);

    document.getElementById('metas-guardar-btn').addEventListener('click', async () => {
      const pwd = document.getElementById('metas-password').value;
      const msg = document.getElementById('metas-msg');
      if (!pwd) { showMsg(msg, 'Ingresa la contraseña.', false); return; }

      const inputs = wrap.querySelectorAll('.meta-input');
      const btn = document.getElementById('metas-guardar-btn');
      btn.disabled = true; btn.textContent = 'Guardando...';

      let errores = 0;
      for (const inp of inputs) {
        const kpiId = inp.dataset.kpi;
        let valStr = inp.value.trim();
        if (!valStr) continue;
        
        let nuevaMeta = parseFloat(valStr.replace('%', ''));
        if (isNaN(nuevaMeta)) continue;

        if (valStr.endsWith('%')) {
            nuevaMeta = nuevaMeta / 100;
        }

        let partida = undefined;
        if (kpiId.trim().toUpperCase() === 'GESTION DE VALOR') {
            const partInp = wrap.querySelector('.meta-partida-input');
            if (partInp && partInp.value.trim() !== '') {
                partida = parseFloat(partInp.value.trim());
            }
        }

        try {
          const res = await post('actualizarMeta', { kpiId, nuevaMeta, password: pwd, partida });
          if (!res.success) errores++;
        } catch (_) { errores++; }
      }

      btn.disabled = false; btn.textContent = 'Guardar metas →';
      if (errores === 0) {
        showMsg(msg, '✅ Metas actualizadas correctamente.', true);
        toast('Metas guardadas', 'ok');
      } else {
        showMsg(msg, '❌ ' + errores + ' error(es) al guardar.', false);
      }
    });

  } catch (e) {
    wrap.innerHTML = '<p style="color:var(--text-2);padding:20px">Error: ' + e.message + '</p>';
  }
}

// ── POPUP TERMINALES / FO ─────────────────────────────────
document.addEventListener('click', e => {
  const btn = e.target.closest('.kpi-detail-btn');
  if (!btn) return;
  const kpi = btn.dataset.kpi;
  if (kpi === 'TERMINALES') abrirPopupTerminales();
  if (kpi === 'FO_TERMINADA') abrirPopupFO();
});

async function abrirPopupTerminales() {
  const popup = crearPopupBase('📦 Modelos vendidos – Terminales');
  popup.querySelector('.popup-body').innerHTML = '<div class="loader-wrap"><div class="spinner"></div></div>';
  try {
    const res = await get('getventasmes');
    if (!res.success) throw new Error(res.error || 'Error al cargar ventas');
    const ventas = res.ventas || [];
    // Filtrar equipos/terminales
    const equipos = ventas.filter(v =>
      (v.categoriaRegla || '').toLowerCase() === 'equipos' ||
      (v.tipoKPIPrincipal || '') === 'TERMINALES'
    );
    if (equipos.length === 0) {
      popup.querySelector('.popup-body').innerHTML = '<p style="color:var(--text-2);padding:20px">Sin terminales registrados este mes.</p>';
      return;
    }
    // Agrupar por modelo + modalidad (tipoEntrada o tipoEntradaRegla)
    const grupos = {};
    equipos.forEach(v => {
      const modelo = v.modeloEquipo || 'Sin modelo';
      const modalidad = v.tipoEntrada || v.tipoEntradaRegla || '—';
      const key = modelo + '||' + modalidad;
      grupos[key] = (grupos[key] || 0) + (parseInt(v.cantidadVendida) || 1);
    });
    // Ordenar de mayor a menor
    const filas = Object.entries(grupos)
      .sort((a, b) => b[1] - a[1])
      .map(([key, cant]) => {
        const [modelo, modalidad] = key.split('||');
        return `<tr><td>${modelo}</td><td style="color:var(--text-2);font-size:0.82rem">${modalidad}</td><td><strong>${cant}</strong></td></tr>`;
      }).join('');
    popup.querySelector('.popup-body').innerHTML = `
      <table class="data-table">
        <thead><tr><th>Modelo</th><th>Modalidad</th><th>Cant.</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>`;
  } catch (e) {
    popup.querySelector('.popup-body').innerHTML = '<p style="color:var(--text-2);padding:20px">Error: ' + e.message + '</p>';
  }
}

async function abrirPopupFO() {
  const popup = crearPopupBase('🌐 Ventas FO – Instalaciones');
  popup.querySelector('.popup-body').innerHTML = '<div class="loader-wrap"><div class="spinner"></div></div>';
  try {
    const res = await get('getventasfo');
    if (!res.success) throw new Error(res.error || 'Error al cargar FO');
    const ventas = res.ventas || [];
    if (ventas.length === 0) {
      popup.querySelector('.popup-body').innerHTML = '<p style="color:var(--text-2);padding:20px">Sin ventas FO este mes.</p>';
      return;
    }
    // Construir tabla con elementos DOM para que los eventos funcionen
    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = '<thead><tr><th>Fecha</th><th>Cliente</th><th>Plan</th><th>Orden</th><th>Instalación FO</th></tr></thead>';
    const tbody = document.createElement('tbody');

    ventas.forEach(v => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${v.fecha || '—'}</td>
        <td>${v.nombre || '—'}</td>
        <td>${v.codigoProducto || '—'}</td>
        <td>${v.orden || '—'}</td>
        <td></td>
      `;
      const tdBtn = tr.querySelector('td:last-child');
      const btn = document.createElement('button');
      let estado = v.instalacionFO === true || v.instalacionFO === 'true' || v.instalacionFO === 'TRUE';
      btn.className = 'btn-fo-toggle ' + (estado ? 'fo-si' : 'fo-no');
      btn.textContent = estado ? '✅ Instalada' : '❌ Pendiente';
      btn.addEventListener('click', async () => {
        const pwd = prompt('Contraseña para editar:');
        if (!pwd) return;
        const nuevoEstado = !estado;
        try {
          const r = await post('editarInstalacionFO', { fila: parseInt(v.filaReal), valor: nuevoEstado, password: pwd });
          if (r.success) {
            estado = nuevoEstado;
            btn.textContent = estado ? '✅ Instalada' : '❌ Pendiente';
            btn.className = 'btn-fo-toggle ' + (estado ? 'fo-si' : 'fo-no');
            toast('Actualizado', 'ok');
          } else { toast('Error: ' + r.error, 'err'); }
        } catch (err) { toast('Error: ' + err.message, 'err'); }
      });
      tdBtn.appendChild(btn);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    popup.querySelector('.popup-body').innerHTML = '';
    popup.querySelector('.popup-body').appendChild(table);
  } catch (e) {
    popup.querySelector('.popup-body').innerHTML = '<p style="color:var(--text-2);padding:20px">Error: ' + e.message + '</p>';
  }
}



// ── POPUP ACELERADORES EDITAR ─────────────────────────────
function initAceleradoresControls() {
  const btnEditar = document.getElementById('acel-btn-editar');
  if (btnEditar) {
    btnEditar.addEventListener('click', () => abrirPopupEditarAceleradores());
  }
}

async function abrirPopupEditarAceleradores() {
  const iconEdit = '<svg width="18" height="18" style="margin-right:6px;vertical-align:bottom" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
  const popup = crearPopupBase(iconEdit + 'Editar Aceleradores');
  popup.querySelector('.popup-body').innerHTML = '<div class="loader-wrap"><div class="spinner"></div></div>';
  
  try {
    const res = await get('getaceleradores');
    if (!res.success) throw new Error(res.error);
    
    let aList = Array.isArray(res.aceleradores) ? res.aceleradores : [];

    function renderList() {
      let html = '<p style="font-size:0.82rem;color:var(--text-2);margin-bottom:16px">Edita el título y la fórmula directamente. Al guardar, se reemplazará la hoja usando A y B.</p>';
      html += '<div id="acel-edit-list" style="display:flex;flex-direction:column;gap:16px;margin-bottom:16px;">';
      
      aList.forEach((item, index) => {
        html += `
          <div class="acel-edit-row" style="background:var(--bg-alt);padding:14px;border-radius:10px;position:relative;border:1px solid var(--border)">
            <div style="display:flex;gap:12px;margin-bottom:10px;">
              <div class="field" style="flex:1;">
                <label>Título de la Tarjeta</label>
                <input type="text" class="acel-titulo" value="${item.titulo || ''}" placeholder="Ej: Voz Móvil">
              </div>
              <button class="btn-borrar-acel" data-idx="${index}" title="Eliminar" style="background:none;border:none;cursor:pointer;color:#d63031;padding:26px 0 0 0;display:flex;align-items:center;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
            </div>
            <div class="field">
              <label>Fórmula o Texto <span style="font-weight:normal;opacity:0.6;font-size:0.75rem">— Valor actual: ${String(item.valorEvaluado || '').substring(0,40)}</span></label>
              <textarea class="acel-formula" rows="3" placeholder="Ej: =&quot;Llevas &quot; & COUNTIF(...)">${item.formulaOTexto || ''}</textarea>
            </div>
          </div>
        `;
      });
      html += '</div>';
      
      html += `<button class="btn-sm btn-ghost" id="btn-add-acel" style="margin-bottom:24px;border-color:var(--accent);color:var(--accent);width:100%;justify-content:center">+ Agregar Nuevo Acelerador</button>`;
      
      html += `
        <div class="form-actions">
          <div class="field" style="flex:1;max-width:220px">
            <label>Contraseña admin</label>
            <input type="password" id="acel-edit-pwd" placeholder="Contraseña">
          </div>
          <button class="btn-accent" id="acel-guardar-btn">Guardar en Sheets →</button>
        </div>
        <p class="form-msg" id="acel-edit-msg"></p>
      `;
      return html;
    }

    const setHtml = () => {
      popup.querySelector('.popup-body').innerHTML = renderList();
      
      // Events for delete
      popup.querySelectorAll('.btn-borrar-acel').forEach(btn => {
        btn.addEventListener('click', e => {
          const idx = parseInt(e.currentTarget.dataset.idx);
          aList.splice(idx, 1);
          setHtml();
        });
      });

      // Event for add
      document.getElementById('btn-add-acel').addEventListener('click', () => {
        aList.push({ titulo: '', formulaOTexto: '', valorEvaluado: '' });
        setHtml();
      });

      // Guardar
      document.getElementById('acel-guardar-btn').addEventListener('click', async () => {
        // Recoger inputs
        const rowEls = popup.querySelectorAll('.acel-edit-row');
        const itemsToSave = [];
        rowEls.forEach(row => {
          const tit = row.querySelector('.acel-titulo').value.trim();
          const form = row.querySelector('.acel-formula').value.trim();
          if (tit || form) itemsToSave.push({ titulo: tit, formulaOTexto: form });
        });

        const pwd = document.getElementById('acel-edit-pwd').value;
        const msg = document.getElementById('acel-edit-msg');
        if (!pwd) { showMsg(msg, 'Ingresa la contraseña admin.', false); return; }

        const btn = document.getElementById('acel-guardar-btn');
        btn.disabled = true; btn.textContent = 'Guardando...';

        try {
          const r = await post('editarAceleradores', { items: itemsToSave, password: pwd });
          if (r.success) {
            showMsg(msg, '✅ Aceleradores guardados exitosamente.', true);
            toast('Aceleradores actualizados', 'ok');
            cargarAceleradores();
            setTimeout(() => { popup.remove(); document.getElementById('generic-overlay').remove(); }, 1200);
          } else {
            showMsg(msg, '❌ ' + (r.error || 'Error'), false);
          }
        } catch (e) { showMsg(msg, '❌ ' + e.message, false); }
        finally { btn.disabled = false; btn.textContent = 'Guardar en Sheets →'; }
      });
    };

    setHtml();
    
  } catch (e) {
    popup.querySelector('.popup-body').innerHTML = '<p style="color:var(--text-2);padding:20px">Error: ' + e.message + '</p>';
  }
}

// ── CERRAR MES ────────────────────────────────────────────
function initCerrarMes() {
  const btn = document.getElementById('nav-cerrar-mes');
  if (!btn) return;
  
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    closeSidebar();
    
    const qty = document.querySelectorAll('#kpi-grid .kpi-card').length;
    // Just a sanity check, no blocking
    
    const pwd = prompt('⚠️ CERRAR MES ⚠️\\n\\nEsta acción generará un PDF con el resumen completo y luego BORRARÁ TODAS LAS VENTAS DEL MES para empezar de cero.\\n\\nPara autorizar, ingresa tu CONTRASEÑA de Administrador:');
    if (!pwd) return;
    
    const email = prompt('📩 ¿A qué correo electrónico deseas enviar el reporte en PDF del mes cerrado?');
    if (!email || !email.includes('@')) {
      toast('Correo inválido o cancelado.', 'err');
      return;
    }

    const conf = confirm(`¿Estás 100% seguro de Cerrar el Mes?\\n\\n- El PDF con todas las hojas se enviará a: ${email}\\n- Se borrará definitivamente el historial de RegistroVentas.\\n\\nEsta acción no se puede deshacer.`);
    if (!conf) return;

    toast('Generando PDF y enviando correo, por favor no cierres la página...', 'ok');
    
    try {
      const res = await post('cerrarmes', { password: pwd, email: email.trim() });
      if (res.success) {
        alert('✅ ÉXITO: ' + res.message);
        window.location.reload();
      } else {
        alert('❌ ERROR: ' + (res.error || 'Desconocido'));
      }
    } catch (err) {
      alert('❌ ERROR de conexión: ' + err.message);
    }
  });
}

// ── HELPER POPUP BASE ─────────────────────────────────────
function crearPopupBase(titulo) {
  // Eliminar popup anterior si existe
  document.getElementById('generic-popup')?.remove();
  document.getElementById('generic-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'generic-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:999;';

  const popup = document.createElement('div');
  popup.id = 'generic-popup';
  popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-card);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.3);z-index:1000;width:90%;max-width:700px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;';
  popup.innerHTML = `
    <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:var(--bg-alt);">
      <strong style="font-family:var(--font-display);font-size:1rem">${titulo}</strong>
      <button onclick="document.getElementById('generic-popup').remove();document.getElementById('generic-overlay').remove();" 
        style="background:none;border:none;font-size:1.3rem;color:var(--text-2);cursor:pointer;padding:0">✕</button>
    </div>
    <div class="popup-body" style="overflow-y:auto;padding:16px;flex:1;"></div>
  `;

  overlay.addEventListener('click', () => { popup.remove(); overlay.remove(); });
  document.body.appendChild(overlay);
  document.body.appendChild(popup);
  return popup;
}
