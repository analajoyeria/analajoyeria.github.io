// =====================================================================
//  PANEL DE ADMINISTRACIÓN - ANALA JOYERÍA
//  Lee y guarda los datos del catálogo directamente en el repositorio
//  de GitHub (API de GitHub + token de acceso). No usa servidor propio.
// =====================================================================

const REPO = { owner: "analajoyeria", repo: "analajoyeria.github.io", branch: "main" };
const API = `https://api.github.com/repos/${REPO.owner}/${REPO.repo}`;
const CLAVE_TOKEN = "anala_admin_token";
const MAX_LADO_FOTO = 1200; // px
const CALIDAD_FOTO = 0.8;

const $ = id => document.getElementById(id);

const estado = {
  token: null,
  categorias: [],         // [{ nombre, archivo, carpeta }]
  listas: {},             // archivo -> { sha, items: [...] }
  config: { sha: null, datos: {} },
  catActual: null,        // archivo de la categoría abierta, o "__config"
  ordenOriginal: null,    // ids antes de reordenar (para descartar)
};

// Vista previa local de fotos recién subidas (GitHub Pages tarda 1-2 min en publicarlas)
const previasLocales = {};

// ---------------------------------------------------------------------
//  Utilidades
// ---------------------------------------------------------------------
const formatoCOP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function esc(txt) {
  return String(txt ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function slug(txt) {
  return String(txt || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 50) || "producto";
}

function srcFoto(ruta) {
  return previasLocales[ruta] || `../${ruta}`;
}

// Ruta real del archivo en el repo (algunas rutas del catálogo vienen codificadas, ej. %23)
function rutaArchivo(ruta) {
  try { return decodeURIComponent(ruta); } catch { return ruta; }
}

function rutaApi(ruta) {
  return ruta.split("/").map(encodeURIComponent).join("/");
}

function textoABase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = "";
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function base64ATexto(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

function blobABase64(blob) {
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(r.result.split(",")[1]);
    r.onerror = mal;
    r.readAsDataURL(blob);
  });
}

// Mismo formato que usa el catálogo: un producto por línea
function listaAJson(items) {
  return "[\n" + items.map(p => "  " + JSON.stringify(p)).join(",\n") + "\n]\n";
}

let avisoTimer;
function aviso(texto, error = false) {
  const el = $("aviso");
  el.textContent = texto;
  el.classList.toggle("aviso--error", error);
  el.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => (el.hidden = true), error ? 6000 : 4000);
}

function cargando(texto) {
  $("cargandoTexto").textContent = texto || "Cargando…";
  $("cargando").hidden = !texto;
}

// ---------------------------------------------------------------------
//  API de GitHub
// ---------------------------------------------------------------------
class ErrorGitHub extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

async function gh(ruta, opciones = {}) {
  const r = await fetch(`${API}${ruta}`, {
    ...opciones,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${estado.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opciones.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (r.status === 401) {
    salir("El token no es válido o ya venció. Ingresa uno nuevo.");
    throw new ErrorGitHub(401, "Token inválido");
  }
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).message || msg; } catch {}
    throw new ErrorGitHub(r.status, msg);
  }
  return r.status === 204 ? null : r.json();
}

async function leerArchivo(ruta) {
  const d = await gh(`/contents/${rutaApi(ruta)}?ref=${REPO.branch}`);
  return { sha: d.sha, texto: base64ATexto(d.content) };
}

async function escribirArchivo(ruta, contenidoBase64, sha, mensaje) {
  const d = await gh(`/contents/${rutaApi(ruta)}`, {
    method: "PUT",
    body: JSON.stringify({ message: mensaje, content: contenidoBase64, branch: REPO.branch, ...(sha ? { sha } : {}) }),
  });
  return d.content.sha;
}

async function borrarArchivo(ruta, mensaje) {
  let sha;
  try {
    sha = (await gh(`/contents/${rutaApi(ruta)}?ref=${REPO.branch}`)).sha;
  } catch (e) {
    if (e.status === 404) return; // ya no existe
    throw e;
  }
  await gh(`/contents/${rutaApi(ruta)}`, {
    method: "DELETE",
    body: JSON.stringify({ message: mensaje, sha, branch: REPO.branch }),
  });
}

// Lee la versión más reciente de una lista, le aplica "cambio" y la guarda.
// Así no se pisan cambios hechos desde otro celular o computador.
async function actualizarLista(archivo, cambio, mensaje) {
  const ruta = `productos/${archivo}.json`;
  for (let intento = 0; intento < 2; intento++) {
    const { sha, texto } = await leerArchivo(ruta);
    const items = JSON.parse(texto);
    cambio(items);
    try {
      const nuevoSha = await escribirArchivo(ruta, textoABase64(listaAJson(items)), sha, mensaje);
      estado.listas[archivo] = { sha: nuevoSha, items };
      return items;
    } catch (e) {
      if ((e.status === 409 || e.status === 422) && intento === 0) continue; // alguien guardó al mismo tiempo: reintenta
      throw e;
    }
  }
}

// ---------------------------------------------------------------------
//  Fotos: se reducen a 1200 px y se pasan a WebP en el navegador
// ---------------------------------------------------------------------
function cargarImagen(url) {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => mal(new Error("No se pudo leer la imagen"));
    img.src = url;
  });
}

async function procesarFoto(archivo) {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await cargarImagen(url);
    const escala = Math.min(1, MAX_LADO_FOTO / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const aBlob = (tipo, calidad) => new Promise(ok => canvas.toBlob(ok, tipo, calidad));
    let blob = await aBlob("image/webp", CALIDAD_FOTO);
    let ext = "webp";
    if (!blob || blob.type !== "image/webp") { // navegadores que no generan WebP
      blob = await aBlob("image/jpeg", 0.85);
      ext = "jpg";
    }
    return { blob, ext };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------------
//  Login
// ---------------------------------------------------------------------
async function entrar(token, recordar) {
  estado.token = token;
  const repo = await gh("");
  if (!repo.permissions || !repo.permissions.push) {
    estado.token = null;
    throw new Error("Este token no tiene permiso para editar el catálogo.");
  }
  (recordar ? localStorage : sessionStorage).setItem(CLAVE_TOKEN, token);
  await cargarTodo();
  $("vistaLogin").hidden = true;
  $("vistaPanel").hidden = false;
}

function salir(mensaje) {
  localStorage.removeItem(CLAVE_TOKEN);
  sessionStorage.removeItem(CLAVE_TOKEN);
  estado.token = null;
  $("vistaPanel").hidden = true;
  $("vistaLogin").hidden = false;
  $("token").value = "";
  $("loginError").textContent = mensaje || "";
  $("loginError").hidden = !mensaje;
  $("modalProducto").open && $("modalProducto").close();
  cargando(null);
}

$("formLogin").addEventListener("submit", async e => {
  e.preventDefault();
  $("loginError").hidden = true;
  $("btnEntrar").disabled = true;
  try {
    await entrar($("token").value.trim(), $("recordar").checked);
  } catch (err) {
    if (err.status !== 401) {
      $("loginError").textContent = err.message.includes("permiso") ? err.message : "No se pudo entrar. Revisa el token y tu conexión.";
      $("loginError").hidden = false;
    }
  } finally {
    $("btnEntrar").disabled = false;
  }
});

$("btnSalir").addEventListener("click", () => salir());

// ---------------------------------------------------------------------
//  Carga de datos
// ---------------------------------------------------------------------
async function cargarTodo() {
  cargando("Cargando catálogo…");
  try {
    const [cats, cfg] = await Promise.all([leerArchivo("productos/categorias.json"), leerArchivo("config.json")]);
    estado.categorias = JSON.parse(cats.texto);
    estado.config = { sha: cfg.sha, datos: JSON.parse(cfg.texto) };
    const listas = await Promise.all(estado.categorias.map(c => leerArchivo(`productos/${c.archivo}.json`)));
    estado.categorias.forEach((c, i) => {
      estado.listas[c.archivo] = { sha: listas[i].sha, items: JSON.parse(listas[i].texto) };
    });
    if (!estado.catActual) estado.catActual = estado.categorias[0].archivo;
    pintarTabs();
    abrirVista(estado.catActual);
  } finally {
    cargando(null);
  }
}

function todosLosProductos() {
  return Object.values(estado.listas).flatMap(l => l.items);
}

// ---------------------------------------------------------------------
//  Pestañas y lista de productos
// ---------------------------------------------------------------------
function pintarTabs() {
  $("tabs").innerHTML =
    estado.categorias.map(c =>
      `<button class="tab${c.archivo === estado.catActual ? " activo" : ""}" data-cat="${esc(c.archivo)}">${esc(c.nombre)} (${estado.listas[c.archivo].items.length})</button>`
    ).join("") +
    `<button class="tab tab--config${estado.catActual === "__config" ? " activo" : ""}" data-cat="__config">⚙ Configuración</button>`;
}

$("tabs").addEventListener("click", e => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  if (estado.ordenOriginal && !confirm("Tienes un cambio de orden sin guardar. ¿Descartarlo?")) return;
  descartarOrden();
  abrirVista(tab.dataset.cat);
});

function abrirVista(cat) {
  estado.catActual = cat;
  pintarTabs();
  const esConfig = cat === "__config";
  $("vistaProductos").hidden = esConfig;
  $("vistaConfig").hidden = !esConfig;
  if (esConfig) {
    $("cfgWhatsapp").value = estado.config.datos.whatsapp || "";
    $("cfgInstagram").value = estado.config.datos.instagram || "";
    $("cfgFacebook").value = estado.config.datos.facebook || "";
  } else {
    $("buscar").value = "";
    pintarLista();
  }
}

function categoriaDe(archivo) {
  return estado.categorias.find(c => c.archivo === archivo);
}

function pintarLista() {
  const archivo = estado.catActual;
  const items = estado.listas[archivo].items;
  const q = slug($("buscar").value);
  const buscando = $("buscar").value.trim() !== "";
  const visibles = buscando ? items.filter(p => slug(`${p.nombre || ""} ${p.referencia || ""} ${p.id}`).includes(q)) : items;

  $("contador").textContent = buscando
    ? `${visibles.length} de ${items.length} productos`
    : `${items.length} productos · el orden de esta lista es el orden en el catálogo`;

  $("lista").innerHTML = visibles.length ? visibles.map(p => {
    const i = items.indexOf(p);
    return `
      <li class="item${p.agotado ? " agotado" : ""}${p.oculto ? " oculto" : ""}" data-id="${p.id}">
        <div class="item__foto"><img src="${esc(srcFoto(p.imagen))}" alt="" loading="lazy" onerror="this.remove()"></div>
        <div class="item__info">
          <p class="item__nombre${p.nombre ? "" : " item__nombre--vacio"}">${esc(p.nombre || `Sin nombre · ref. ${p.id}`)}</p>
          <p class="item__precio">${p.referencia ? `Ref. ${esc(p.referencia)} · ` : ""}${p.precio ? formatoCOP.format(p.precio) : "Precio a consultar"}${p.agotado ? '<span class="item__tag">Agotado</span>' : ""}${p.oculto ? '<span class="item__tag">Oculto</span>' : ""}</p>
        </div>
        <div class="item__acciones">
          <button class="icono" data-accion="subir" title="Subir" aria-label="Subir" ${buscando || i === 0 ? "disabled" : ""}>↑</button>
          <button class="icono" data-accion="bajar" title="Bajar" aria-label="Bajar" ${buscando || i === items.length - 1 ? "disabled" : ""}>↓</button>
          <button class="icono" data-accion="editar" title="Editar" aria-label="Editar">✎</button>
          <button class="icono icono--borrar" data-accion="borrar" title="Eliminar" aria-label="Eliminar">🗑</button>
        </div>
      </li>`;
  }).join("") : `<li class="vacio">${buscando ? "Nada coincide con la búsqueda." : "Esta categoría no tiene productos todavía."}</li>`;
}

$("buscar").addEventListener("input", pintarLista);
$("btnNuevo").addEventListener("click", () => abrirFormulario(null));

$("lista").addEventListener("click", e => {
  const btn = e.target.closest("[data-accion]");
  if (!btn) return;
  const id = Number(btn.closest(".item").dataset.id);
  const items = estado.listas[estado.catActual].items;
  const p = items.find(x => x.id === id);
  const accion = btn.dataset.accion;
  if (accion === "editar") abrirFormulario(p);
  if (accion === "borrar") eliminarProducto(p);
  if (accion === "subir" || accion === "bajar") mover(items, items.indexOf(p), accion === "subir" ? -1 : 1);
});

// ---------------------------------------------------------------------
//  Reordenar
// ---------------------------------------------------------------------
function mover(items, i, delta) {
  const j = i + delta;
  if (j < 0 || j >= items.length) return;
  if (!estado.ordenOriginal) estado.ordenOriginal = items.map(p => p.id);
  [items[i], items[j]] = [items[j], items[i]];
  $("barraOrden").hidden = false;
  pintarLista();
}

function descartarOrden() {
  if (!estado.ordenOriginal) return;
  const lista = estado.listas[estado.catActual];
  const pos = new Map(estado.ordenOriginal.map((id, i) => [id, i]));
  lista.items.sort((a, b) => pos.get(a.id) - pos.get(b.id));
  estado.ordenOriginal = null;
  $("barraOrden").hidden = true;
}

$("btnDescartarOrden").addEventListener("click", () => { descartarOrden(); pintarLista(); });

$("btnGuardarOrden").addEventListener("click", async () => {
  const archivo = estado.catActual;
  const orden = estado.listas[archivo].items.map(p => p.id);
  cargando("Guardando orden…");
  try {
    await actualizarLista(archivo, items => {
      const pos = new Map(orden.map((id, i) => [id, i]));
      items.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
    }, `Reordenar ${categoriaDe(archivo).nombre}`);
    estado.ordenOriginal = null;
    $("barraOrden").hidden = true;
    pintarLista();
    aviso("Orden guardado. Se verá en el catálogo en 1–2 minutos.");
  } catch (e) {
    manejarError(e);
  } finally {
    cargando(null);
  }
});

// ---------------------------------------------------------------------
//  Formulario de producto (crear / editar)
// ---------------------------------------------------------------------
// Cada foto del formulario es { ruta } (ya existe) o { archivo, previa } (nueva, sin subir)
const form = { producto: null, archivoOriginal: null, fotos: [] };

function ordenPendiente() {
  if (!estado.ordenOriginal) return false;
  aviso("Primero guarda o descarta el cambio de orden.", true);
  return true;
}

function abrirFormulario(p) {
  if (ordenPendiente()) return;
  form.producto = p || null;
  form.archivoOriginal = estado.catActual;
  const fotos = p ? [p.imagen, ...(p.imagenes || []).filter(r => r !== p.imagen)] : [];
  form.fotos = fotos.filter(Boolean).map(ruta => ({ ruta }));

  $("formTitulo").textContent = p ? "Editar producto" : "Nuevo producto";
  $("fNombre").value = p?.nombre || "";
  $("fReferencia").value = p?.referencia || "";
  $("fPrecio").value = p?.precio || "";
  $("fAgotado").checked = !!p?.agotado;
  $("fOculto").checked = !!p?.oculto;
  $("fCategoria").innerHTML = estado.categorias.map(c =>
    `<option value="${esc(c.archivo)}"${c.archivo === estado.catActual ? " selected" : ""}>${esc(c.nombre)}</option>`).join("");
  $("formError").hidden = true;
  pintarPrecio();
  pintarFotos();
  $("modalProducto").showModal();
  $("modalProducto").scrollTop = 0;
}

function srcDe(f) { return f.previa || srcFoto(f.ruta); }

function pintarFotos() {
  const [principal, ...extras] = form.fotos;
  $("fotoPrincipal").innerHTML = principal
    ? `<img src="${esc(srcDe(principal))}" alt="Foto principal" onerror="this.remove()">`
    : "✦";
  $("txtFoto").textContent = principal ? "Cambiar foto principal" : "Subir foto";
  $("fotosExtra").innerHTML = extras.map((f, i) => `
    <div class="extra">
      <img src="${esc(srcDe(f))}" alt="" onerror="this.remove()">
      <button type="button" data-i="${i + 1}" aria-label="Quitar foto">×</button>
    </div>`).join("");
}

function pintarPrecio() {
  const n = leerPrecio();
  $("fPrecioVista").textContent = n ? formatoCOP.format(n) : "Se mostrará: Precio a consultar";
}

function leerPrecio() {
  const n = Number($("fPrecio").value.replace(/[^\d]/g, ""));
  return n > 0 ? n : null;
}

$("fPrecio").addEventListener("input", pintarPrecio);

function fotoNueva(archivo) {
  return { archivo, previa: URL.createObjectURL(archivo) };
}

$("inFoto").addEventListener("change", e => {
  const archivo = e.target.files[0];
  e.target.value = "";
  if (!archivo) return;
  if (form.fotos.length) form.fotos[0] = fotoNueva(archivo);
  else form.fotos.push(fotoNueva(archivo));
  pintarFotos();
});

$("inExtras").addEventListener("change", e => {
  const nuevos = [...e.target.files];
  e.target.value = "";
  nuevos.forEach(a => form.fotos.push(fotoNueva(a)));
  pintarFotos();
});

$("fotosExtra").addEventListener("click", e => {
  const btn = e.target.closest("button[data-i]");
  if (!btn) return;
  form.fotos.splice(Number(btn.dataset.i), 1);
  pintarFotos();
});

$("btnCancelar").addEventListener("click", () => $("modalProducto").close());

function errorFormulario(msg) {
  $("formError").textContent = msg;
  $("formError").hidden = false;
}

$("btnGuardar").addEventListener("click", async () => {
  const nombre = $("fNombre").value.trim().replace(/\s+/g, " ");
  const referencia = $("fReferencia").value.trim().replace(/\s+/g, " ");
  const destino = $("fCategoria").value;
  if (!form.fotos.length) return errorFormulario("Sube al menos la foto principal.");
  if (!nombre && !form.producto) return errorFormulario("Escribe el nombre del producto.");

  $("btnGuardar").disabled = true;
  try {
    // 1. Subir las fotos nuevas
    const carpeta = categoriaDe(destino).carpeta;
    const base = slug(nombre || categoriaDe(destino).nombre);
    const nuevas = form.fotos.filter(f => f.archivo);
    let n = 0;
    for (const f of form.fotos) {
      if (!f.archivo) continue;
      n++;
      cargando(`Subiendo foto ${n} de ${nuevas.length}…`);
      const { blob, ext } = await procesarFoto(f.archivo);
      const ruta = `${carpeta}/${base}-${Date.now().toString(36)}${n}.${ext}`;
      await escribirArchivo(ruta, await blobABase64(blob), null, `Foto: ${nombre || base}`);
      previasLocales[ruta] = f.previa;
      f.ruta = ruta;
      delete f.archivo;
    }

    // 2. Armar el producto
    cargando("Guardando producto…");
    const rutas = form.fotos.map(f => f.ruta);
    const original = form.producto;
    const id = original ? original.id : Math.max(0, ...todosLosProductos().map(p => p.id)) + 1;
    const producto = { id };
    if (nombre) producto.nombre = nombre;
    if (referencia) producto.referencia = referencia;
    producto.precio = leerPrecio();
    producto.imagen = rutas[0];
    if (rutas.length > 1) producto.imagenes = rutas;
    if ($("fAgotado").checked) producto.agotado = true;
    if ($("fOculto").checked) producto.oculto = true;

    // 3. Guardar en la(s) lista(s)
    const etiqueta = nombre || `ref. ${id}`;
    if (!original) {
      await actualizarLista(destino, items => items.unshift(producto), `Nuevo producto: ${etiqueta}`);
    } else if (destino === form.archivoOriginal) {
      await actualizarLista(destino, items => {
        const i = items.findIndex(p => p.id === id);
        if (i === -1) items.unshift(producto); else items[i] = producto;
      }, `Editar producto: ${etiqueta}`);
    } else {
      await actualizarLista(destino, items => items.unshift(producto), `Mover a ${categoriaDe(destino).nombre}: ${etiqueta}`);
      await actualizarLista(form.archivoOriginal, items => {
        const i = items.findIndex(p => p.id === id);
        if (i !== -1) items.splice(i, 1);
      }, `Mover a ${categoriaDe(destino).nombre}: ${etiqueta}`);
    }

    // 4. Borrar del repo las fotos que se quitaron (si ningún otro producto las usa)
    if (original) {
      const antes = [original.imagen, ...(original.imagenes || [])];
      await borrarFotosSinUso(antes.filter(r => !rutas.includes(r)), etiqueta);
    }

    $("modalProducto").close();
    pintarTabs();
    abrirVista(destino);
    aviso(original ? "Producto actualizado. Se verá en el catálogo en 1–2 minutos." : "Producto creado. Se verá en el catálogo en 1–2 minutos.");
  } catch (e) {
    manejarError(e, true);
  } finally {
    $("btnGuardar").disabled = false;
    cargando(null);
  }
});

async function borrarFotosSinUso(rutas, etiqueta) {
  const enUso = new Set(todosLosProductos().flatMap(p => [p.imagen, ...(p.imagenes || [])]));
  for (const ruta of new Set(rutas)) {
    if (!ruta || enUso.has(ruta) || !ruta.startsWith("img/")) continue;
    try {
      await borrarArchivo(rutaArchivo(ruta), `Quitar foto: ${etiqueta}`);
    } catch (e) {
      console.warn("No se pudo borrar", ruta, e); // no es grave: el producto ya quedó guardado
    }
  }
}

// ---------------------------------------------------------------------
//  Eliminar producto
// ---------------------------------------------------------------------
function confirmar(texto) {
  return new Promise(ok => {
    const m = $("modalConfirmar");
    $("confirmarTexto").textContent = texto;
    const fin = r => { m.close(); ok(r); };
    $("confirmarSi").onclick = () => fin(true);
    $("confirmarNo").onclick = () => fin(false);
    m.oncancel = () => ok(false);
    m.showModal();
  });
}

async function eliminarProducto(p) {
  if (ordenPendiente()) return;
  const etiqueta = p.nombre || `ref. ${p.id}`;
  if (!(await confirmar(`¿Eliminar "${etiqueta}" del catálogo? Esta acción no se puede deshacer desde el panel.`))) return;
  const archivo = estado.catActual;
  cargando("Eliminando…");
  try {
    await actualizarLista(archivo, items => {
      const i = items.findIndex(x => x.id === p.id);
      if (i !== -1) items.splice(i, 1);
    }, `Eliminar producto: ${etiqueta}`);
    await borrarFotosSinUso([p.imagen, ...(p.imagenes || [])], etiqueta);
    pintarTabs();
    pintarLista();
    aviso("Producto eliminado.");
  } catch (e) {
    manejarError(e);
  } finally {
    cargando(null);
  }
}

// ---------------------------------------------------------------------
//  Configuración
// ---------------------------------------------------------------------
$("formConfig").addEventListener("submit", async e => {
  e.preventDefault();
  const whatsapp = $("cfgWhatsapp").value.replace(/[^\d]/g, "");
  const instagram = $("cfgInstagram").value.trim();
  const facebook = $("cfgFacebook").value.trim();
  if (whatsapp.length < 11 || whatsapp.length > 15) return aviso("Revisa el número: debe llevar el 57 adelante, ej. 573001234567.", true);
  cargando("Guardando configuración…");
  try {
    const actual = await leerArchivo("config.json");
    const datos = { ...JSON.parse(actual.texto), whatsapp, instagram, facebook };
    const sha = await escribirArchivo("config.json", textoABase64(JSON.stringify(datos, null, 2) + "\n"), actual.sha, "Actualizar configuración");
    estado.config = { sha, datos };
    $("cfgWhatsapp").value = whatsapp;
    aviso("Configuración guardada. Se verá en el catálogo en 1–2 minutos.");
  } catch (err) {
    manejarError(err);
  } finally {
    cargando(null);
  }
});

// ---------------------------------------------------------------------
//  Errores
// ---------------------------------------------------------------------
function manejarError(e, enFormulario = false) {
  console.error(e);
  if (e.status === 401) return; // ya se mostró el login
  let msg = "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.";
  if (e.status === 403) msg = "El token no tiene permiso para guardar cambios.";
  if (e.status === 409 || e.status === 422) msg = "Alguien guardó un cambio al mismo tiempo. Recarga la página e inténtalo de nuevo.";
  if (e.message === "No se pudo leer la imagen") msg = "No se pudo leer una de las fotos. Prueba con otra imagen (JPG o PNG).";
  if (enFormulario) errorFormulario(msg);
  else aviso(msg, true);
}

window.addEventListener("beforeunload", e => {
  if (estado.ordenOriginal) { e.preventDefault(); e.returnValue = ""; }
});

// ---------------------------------------------------------------------
//  Inicio
// ---------------------------------------------------------------------
(async () => {
  const guardado = localStorage.getItem(CLAVE_TOKEN) || sessionStorage.getItem(CLAVE_TOKEN);
  if (!guardado) { $("vistaLogin").hidden = false; return; }
  try {
    await entrar(guardado, !!localStorage.getItem(CLAVE_TOKEN));
  } catch (e) {
    if (e.status !== 401) salir("No se pudo conectar. Revisa tu conexión y vuelve a entrar.");
  }
})();
