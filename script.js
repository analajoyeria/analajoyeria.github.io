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

function render() {
  const q = normalizar(buscar.value.trim());
  const lista = PRODUCTOS.filter(p =>
    (categoriaActiva === "Todas" || p.categoria === categoriaActiva) &&
    normalizar(p.nombre + " " + p.descripcion).includes(q)
  );

  grid.innerHTML = lista.map(p => {
    const mensaje = `¡Hola Anala Joyería! Me interesa: ${p.nombre} (${formatoCOP.format(p.precio)}). ¿Está disponible?`;
    return `
      <article class="card${p.agotado ? " agotado" : ""}">
        <div class="card__img">
          <img src="${p.imagen}" alt="${p.nombre}" loading="lazy"
               onerror="this.remove()">
          <span class="card__placeholder">✦</span>
          ${p.agotado ? '<span class="card__tag">Agotado</span>' : ""}
        </div>
        <div class="card__body">
          <p class="card__cat">${p.categoria}</p>
          <h3 class="card__nombre">${p.nombre}</h3>
          <p class="card__desc">${p.descripcion}</p>
          <p class="card__precio">${formatoCOP.format(p.precio)}</p>
          ${p.agotado
            ? '<span class="btn btn--off">Agotado</span>'
            : `<a class="btn" href="${linkWhatsApp(mensaje)}" target="_blank" rel="noopener">Pedir por WhatsApp</a>`}
        </div>
      </article>`;
  }).join("");

  vacio.hidden = lista.length > 0;
}

render();
