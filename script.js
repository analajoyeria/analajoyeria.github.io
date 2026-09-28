const grid = document.getElementById("grid");
const filtrosEl = document.getElementById("filtros");
const buscar = document.getElementById("buscar");
const vacio = document.getElementById("vacio");

let categoriaActiva = "Todas";

const formatoCOP = new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", maximumFractionDigits: 0,
});

function linkWhatsApp(mensaje) {
  return `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(mensaje)}`;
}

// Nombre para mostrar; si el producto no tiene nombre, usa la categoría y su referencia
function etiqueta(p) {
  return p.nombre || `${p.categoria}, ref. ${p.id}`;
}

// Precio para mostrar; si está vacío (null), se consulta por WhatsApp
function precioTexto(p) {
  return p.precio ? formatoCOP.format(p.precio) : "Precio a consultar";
}

function linkPedido(p) {
  return linkWhatsApp(`¡Hola Anala Joyería! Me interesa: ${etiqueta(p)}${p.precio ? ` (${formatoCOP.format(p.precio)})` : ""}. ¿Está disponible?`);
}

function botonPedido(p) {
  return p.agotado
    ? '<span class="btn btn--off">Agotado</span>'
    : `<a class="btn" href="${linkPedido(p)}" target="_blank" rel="noopener">Pedir por WhatsApp</a>`;
}

// Todas las fotos del producto: usa "imagenes" si existe, si no la "imagen" principal
function fotosDe(p) {
  return p.imagenes && p.imagenes.length ? p.imagenes : [p.imagen];
}

// Enlaces generales
const waGeneral = linkWhatsApp("¡Hola Anala Joyería! Quiero información sobre el catálogo.");
document.getElementById("waHeader").href = waGeneral;
document.getElementById("waFooter").href = waGeneral;
document.getElementById("instagram").href = CONFIG.instagram;
document.getElementById("anio").textContent = new Date().getFullYear();

// Filtros por categoría (se crean solos a partir de los productos)
const categorias = ["Todas", ...new Set(PRODUCTOS.map(p => p.categoria))];
filtrosEl.innerHTML = categorias
  .map(c => `<button class="filtro${c === categoriaActiva ? " activo" : ""}" data-cat="${c}">${c}</button>`)
  .join("");

filtrosEl.addEventListener("click", e => {
  const btn = e.target.closest(".filtro");
  if (!btn) return;
  categoriaActiva = btn.dataset.cat;
  filtrosEl.querySelectorAll(".filtro").forEach(b => b.classList.toggle("activo", b === btn));
  render();
});

buscar.addEventListener("input", render);

function normalizar(txt) {
  return txt.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Revisa qué fotos no existen (una vez por archivo) para mandar esos productos al final
const fotosFaltantes = new Set();
new Set(PRODUCTOS.map(p => p.imagen)).forEach(src => {
  const img = new Image();
  img.onerror = () => { fotosFaltantes.add(src); render(); };
  img.src = src;
});

function render() {
  const q = normalizar(buscar.value.trim());
  const lista = PRODUCTOS.filter(p =>
    (categoriaActiva === "Todas" || p.categoria === categoriaActiva) &&
    normalizar((p.nombre || "") + " " + p.categoria).includes(q)
  );
  // Los productos con foto primero; los que aún no tienen foto, al final
  lista.sort((a, b) => fotosFaltantes.has(a.imagen) - fotosFaltantes.has(b.imagen));

  grid.innerHTML = lista.map(p => {
    const nFotos = fotosDe(p).length;
    return `
      <article class="card${p.agotado ? " agotado" : ""}" data-id="${p.id}" tabindex="0" aria-label="Ver ${etiqueta(p)}">
        <div class="card__img">
          <img src="${p.imagen}" alt="${etiqueta(p)}" loading="lazy"
               onerror="this.remove()">
          <span class="card__placeholder">✦</span>
          ${p.agotado ? '<span class="card__tag">Agotado</span>' : ""}
          ${nFotos > 1 ? `<span class="card__fotos">${nFotos} fotos</span>` : ""}
        </div>
        <div class="card__body">
          <p class="card__cat">${p.categoria}</p>
          ${p.nombre ? `<h3 class="card__nombre">${p.nombre}</h3>` : ""}
          <p class="card__precio">${precioTexto(p)}</p>
          ${botonPedido(p)}
        </div>
      </article>`;
  }).join("");

  vacio.hidden = lista.length > 0;
}

// ---------- Modal del producto ----------
const modal = document.getElementById("modal");
const modalFotos = document.getElementById("modalFotos");
const modalMinis = document.getElementById("modalMinis");
const modalPrev = document.getElementById("modalPrev");
const modalNext = document.getElementById("modalNext");

function abrirModal(p) {
  const fotos = fotosDe(p);
  const varias = fotos.length > 1;

  modalFotos.innerHTML = fotos.map((src, i) => `
    <div class="modal__foto">
      <img src="${src}" alt="${etiqueta(p)} – foto ${i + 1}" onerror="this.remove()">
      <span class="card__placeholder">✦</span>
    </div>`).join("");
  modalMinis.innerHTML = varias
    ? fotos.map((src, i) => `
      <button class="modal__mini${i === 0 ? " activa" : ""}" data-i="${i}" aria-label="Ver foto ${i + 1}">
        <img src="${src}" alt="" onerror="this.remove()">
      </button>`).join("")
    : "";
  modalPrev.hidden = modalNext.hidden = !varias;

  document.getElementById("modalCat").textContent = p.categoria;
  document.getElementById("modalNombre").textContent = p.nombre || "";
  document.getElementById("modalPrecio").textContent = precioTexto(p);
  document.getElementById("modalAccion").innerHTML = botonPedido(p);
  modal.classList.toggle("agotado", !!p.agotado);

  document.documentElement.classList.add("sin-scroll");
  modal.showModal();
  modalFotos.scrollLeft = 0;
}

function fotoActual() {
  return Math.round(modalFotos.scrollLeft / modalFotos.clientWidth);
}

function irAFoto(i) {
  const total = modalFotos.children.length;
  i = (i + total) % total;
  modalFotos.scrollTo({ left: i * modalFotos.clientWidth, behavior: "smooth" });
}

grid.addEventListener("click", e => {
  if (e.target.closest("a, .btn")) return; // el botón de WhatsApp de la tarjeta sigue funcionando
  const card = e.target.closest(".card");
  if (card) abrirModal(PRODUCTOS.find(p => p.id === Number(card.dataset.id)));
});

grid.addEventListener("keydown", e => {
  if (e.key !== "Enter" || !e.target.classList.contains("card")) return;
  abrirModal(PRODUCTOS.find(p => p.id === Number(e.target.dataset.id)));
});

modalPrev.addEventListener("click", () => irAFoto(fotoActual() - 1));
modalNext.addEventListener("click", () => irAFoto(fotoActual() + 1));

modalMinis.addEventListener("click", e => {
  const mini = e.target.closest(".modal__mini");
  if (mini) irAFoto(Number(mini.dataset.i));
});

modalFotos.addEventListener("scroll", () => {
  const i = fotoActual();
  modalMinis.querySelectorAll(".modal__mini").forEach((m, j) => m.classList.toggle("activa", j === i));
});

modal.addEventListener("keydown", e => {
  if (modalPrev.hidden || visor) return;
  if (e.key === "ArrowLeft") irAFoto(fotoActual() - 1);
  if (e.key === "ArrowRight") irAFoto(fotoActual() + 1);
});

modal.addEventListener("click", e => { if (e.target === modal) modal.close(); }); // clic fuera

// ---------- Visor de fotos en pantalla completa (PhotoSwipe) ----------
// Al tocar una foto del modal se abre completa, con zoom (dos dedos, doble toque o rueda del mouse).
const PHOTOSWIPE_URL = "https://cdn.jsdelivr.net/npm/photoswipe@5.4.4/dist/photoswipe.esm.min.js";
let visor = null;

function tamanoFoto(img) {
  if (img.complete && img.naturalWidth) return Promise.resolve(img);
  return new Promise(listo => {
    const tmp = new Image();
    tmp.onload = tmp.onerror = () => listo(tmp);
    tmp.src = img.currentSrc || img.src;
  });
}

modalFotos.addEventListener("click", async e => {
  const foto = e.target.closest(".modal__foto");
  if (!foto || !foto.querySelector("img") || visor) return;
  const conFoto = [...modalFotos.querySelectorAll(".modal__foto")].filter(f => f.querySelector("img"));
  const imgs = conFoto.map(f => f.querySelector("img"));
  const [{ default: PhotoSwipe }, tamanos] = await Promise.all([
    import(PHOTOSWIPE_URL),
    Promise.all(imgs.map(tamanoFoto)),
  ]);
  visor = new PhotoSwipe({
    dataSource: imgs.map((img, i) => ({
      src: img.currentSrc || img.src,
      width: tamanos[i].naturalWidth || 1200,
      height: tamanos[i].naturalHeight || 1200,
      alt: img.alt,
    })),
    index: conFoto.indexOf(foto),
    appendToEl: modal, // dentro del <dialog> para quedar por encima de él
    bgOpacity: 0.95,
    showHideAnimationType: "fade",
    wheelToZoom: true,
    closeTitle: "Cerrar",
    zoomTitle: "Ampliar",
    arrowPrevTitle: "Foto anterior",
    arrowNextTitle: "Foto siguiente",
    errorMsg: "No se pudo cargar la foto",
  });
  visor.on("destroy", () => { visor = null; });
  visor.init();
});

// Esc cierra solo el visor, no el modal del producto
modal.addEventListener("cancel", e => { if (visor) e.preventDefault(); });
modal.addEventListener("close", () => document.documentElement.classList.remove("sin-scroll"));

render();
