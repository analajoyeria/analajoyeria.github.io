// ==========================================================
//  CONFIGURACIÓN DEL NEGOCIO  (cambia estos datos)
// ==========================================================
const CONFIG = {
  // Número con indicativo de país, sin +, sin espacios. Ej: 573001234567
  whatsapp: "573169386523",
  instagram: "https://instagram.com/analajoyeria",
};

// ==========================================================
//  PRODUCTOS
//  - Para agregar uno, copia un bloque { ... } y cambia los datos.
//  - Las fotos van en la carpeta img/productos/ (ideal .webp, cuadradas).
//  - Si la foto no existe, se muestra un recuadro dorado de reemplazo.
//  - agotado: true  -> muestra "Agotado" y desactiva el botón.
// ==========================================================
const PRODUCTOS = [
  { id: 1,  nombre: "Anillo Solitario",        categoria: "Anillos",   precio: 85000,  descripcion: "Acero inoxidable bañado en oro, circón central.", imagen: "img/productos/anillo-solitario.webp" },
  { id: 2,  nombre: "Anillo Trenzado",         categoria: "Anillos",   precio: 65000,  descripcion: "Diseño entrelazado, ajustable.",                  imagen: "img/productos/anillo-trenzado.webp" },
  { id: 3,  nombre: "Collar Corazón",          categoria: "Collares",  precio: 95000,  descripcion: "Cadena de 45 cm con dije de corazón.",            imagen: "img/productos/collar-corazon.webp" },
  { id: 4,  nombre: "Collar Inicial",          categoria: "Collares",  precio: 90000,  descripcion: "Personalizado con la letra que quieras.",         imagen: "img/productos/collar-inicial.webp" },
  { id: 5,  nombre: "Aretes Argolla",          categoria: "Aretes",    precio: 55000,  descripcion: "Argollas medianas, livianas y cómodas.",           imagen: "img/productos/aretes-argolla.webp" },
  { id: 6,  nombre: "Aretes Perla",            categoria: "Aretes",    precio: 60000,  descripcion: "Perla sintética con base dorada.",                 imagen: "img/productos/aretes-perla.webp", agotado: true },
  { id: 7,  nombre: "Pulsera Eslabones",       categoria: "Pulseras",  precio: 75000,  descripcion: "Eslabón grueso, cierre de seguridad.",             imagen: "img/productos/pulsera-eslabones.webp" },
  { id: 8,  nombre: "Pulsera Tennis",          categoria: "Pulseras",  precio: 120000, descripcion: "Línea de circones, brillo total.",                 imagen: "img/productos/pulsera-tennis.webp" },
];
