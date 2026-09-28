// ==========================================================
//  CONFIGURACIÓN DEL NEGOCIO  (cambia estos datos)
// ==========================================================
const CONFIG = {
  // Número con indicativo de país, sin +, sin espacios. Ej: 573001234567
  whatsapp: "573183849156",
  instagram: "https://instagram.com/analajoyeria",
};

// ==========================================================
//  PRODUCTOS
//  - Cada categoría tiene su propio archivo en la carpeta productos/
//    (anillos.js, topos.js, ...). Ahí agregas o cambias los productos.
//  - Para agregar uno, copia un bloque { ... } y cambia los datos.
//  - Cada "id" debe ser un número distinto en TODOS los archivos.
//  - Categoría nueva: crea productos/nueva.js (copia uno existente) y
//    agrega su <script> en index.html. El orden de los <script> es el
//    orden de los filtros.
//  - Las fotos van en la carpeta img/productos/ (ideal .webp, cuadradas).
//  - Si la foto no existe, se muestra un recuadro dorado de reemplazo.
//  - Para varias fotos (se ven al tocar la tarjeta), agrega:
//      imagenes: ["img/productos/x-1.webp", "img/productos/x-2.webp"]
//    "imagen" sigue siendo la foto de la tarjeta; inclúyela también en "imagenes".
//  - agotado: true  -> muestra "Agotado" y desactiva el botón.
// ==========================================================
const PRODUCTOS = [];
