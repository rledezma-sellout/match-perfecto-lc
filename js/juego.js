/* =========================================================
   ¿ESTÁS VIENDO DOBLE? – La Crianza
   Juego tipo Dobble: 31 cartas, 6 símbolos por carta.
   Cualquier par de cartas comparte EXACTAMENTE un símbolo.
   ========================================================= */

const CONFIG = {
  tiempoSegundos: 60,      // duración de la partida
  aciertosParaGanar: 5,    // pares necesarios para ganar
  segundosUrgente: 10,     // el reloj se pone rojo bajo este valor
  retrasoTrasRespuesta: 700, // ms que se muestra el resultado (verde/rojo) antes de cambiar cartas
  penalizacionError: 0,    // segundos que se restan por par incorrecto (0 = sin castigo)
  tamanoMin: 24,           // tamaño del símbolo más chico (% del diámetro de la carta)
  tamanoMax: 32,           // tamaño del símbolo más grande
  variacionTamano: 1,      // variación aleatoria extra sobre cada tamaño
  volverAlInicio: 20,     // segundos en pantalla final antes de volver solo al inicio (0 = nunca)

  // true  = usar las 31 cartas del juego físico (js/cartas-diseno.js): mismos símbolos,
  //         posición, tamaño y rotación que el diseño impreso.
  // false = cartas generadas al azar (tamanoMin / tamanoMax / variacionTamano se usan solo aquí).
  usarCartasDiseno: true,

  // 31 símbolos. Para reemplazarlos, sobrescribe los archivos manteniendo el nombre.
  rutaSimbolo: (n) => `assets/simbolos/simbolo-${String(n).padStart(2, '0')}.webp`,
};

/* ---------- Generación de cartas (plano proyectivo de orden 5) ----------
   n = 5 (primo) → n²+n+1 = 31 cartas y 31 símbolos, n+1 = 6 símbolos por carta. */
function generarCartas(n = 5) {
  const cartas = [];
  const punto = (x, y) => x * n + y;          // símbolos 0..24
  const pendiente = (m) => n * n + m;         // símbolos 25..30 (m = 0..n, n = vertical)

  for (let m = 0; m < n; m++)                 // rectas y = m·x + b
    for (let b = 0; b < n; b++) {
      const c = [pendiente(m)];
      for (let x = 0; x < n; x++) c.push(punto(x, (m * x + b) % n));
      cartas.push(c);
    }
  for (let x = 0; x < n; x++) {               // rectas verticales x = c
    const c = [pendiente(n)];
    for (let y = 0; y < n; y++) c.push(punto(x, y));
    cartas.push(c);
  }
  const infinito = [];                        // recta del infinito
  for (let m = 0; m <= n; m++) infinito.push(pendiente(m));
  cartas.push(infinito);

  return cartas;
}

const USAR_DISENO = CONFIG.usarCartasDiseno && Array.isArray(window.CARTAS_DISENO);
const CARTAS = USAR_DISENO
  ? window.CARTAS_DISENO.map((carta) => carta.map((sim) => sim.s - 1))   // símbolos 0..30
  : generarCartas();

// Verificación (ver consola del navegador)
(function verificar() {
  let ok = CARTAS.length === 31;
  for (let i = 0; i < CARTAS.length && ok; i++)
    for (let j = i + 1; j < CARTAS.length; j++) {
      const comunes = CARTAS[i].filter((s) => CARTAS[j].includes(s)).length;
      if (comunes !== 1) { ok = false; break; }
    }
  console.log(ok ? '✔ 31 cartas válidas: todo par comparte exactamente 1 símbolo'
                 : '✘ Error en la generación de cartas');
})();

/* ---------- Utilidades ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const azar = (min, max) => min + Math.random() * (max - min);
const barajar = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Precarga de imágenes para que no parpadeen al cambiar de carta
for (let i = 1; i <= 31; i++) new Image().src = CONFIG.rutaSimbolo(i);

/* ---------- Estado ---------- */
const estado = {
  aciertos: 0,
  restante: CONFIG.tiempoSegundos,
  timer: null,
  bloqueado: false,
  seleccion: { 'carta-a': null, 'carta-b': null },
  mazo: [],          // índices de cartas por salir
  cartaA: null,
  cartaB: null,
  autoInicio: null,
};

/* ---------- Pantallas ---------- */
function mostrarPantalla(id) {
  $$('.pantalla').forEach((p) => p.classList.toggle('activa', p.id === id));
}

/* ---------- Dibujo de una carta ----------
   1 símbolo al centro + 5 en anillo, con rotación y tamaño aleatorio. */
/* Tamaños aleatorios: cada carta reparte 6 "niveles" de tamaño (de chico a grande)
   en orden aleatorio, con una variación extra. Así el mismo símbolo casi nunca
   tiene el mismo tamaño en las dos cartas. Valores en % del diámetro de la carta. */
function tamanosAleatorios() {
  const { tamanoMin: min, tamanoMax: max, variacionTamano: v } = CONFIG;
  const niveles = Array.from({ length: 6 }, (_, i) => min + ((max - min) * i) / 5);
  return barajar(niveles).map((t) => Math.min(max, Math.max(min, t + azar(-v, v))));
}

/* Ubica los símbolos en posiciones aleatorias dentro del círculo sin que se toquen.
   Parte de posiciones al azar y los va "empujando": los que se tocan se separan y los que
   se salen del círculo vuelven a entrar, hasta que todos caben. Aprovecha mucho mejor el
   espacio que ubicarlos uno a uno, así que permite símbolos más grandes.
   Si en varios intentos no caben, se achican un poco (rara vez ocurre). */
function ubicarSimbolos(tamanos) {
  const radioCarta = 47.5;       // margen interior respecto al borde (50 = borde)
  const separacion = 1.2;
  const forma = 0.54;            // radio que ocupa una imagen respecto a su caja
  let escala = 1;
  for (let intento = 0; ; intento++) {           // siempre termina: la escala se reduce hasta que caben
    const s = tamanos.map((t) => {
      const r = t * escala * forma;
      const ang = azar(0, Math.PI * 2), dist = Math.sqrt(Math.random()) * (radioCarta - r);
      return { r, x: 50 + dist * Math.cos(ang), y: 50 + dist * Math.sin(ang) };
    });
    let ok = false;
    for (let it = 0; it < 300 && !ok; it++) {
      ok = true;
      for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
        let dx = s[j].x - s[i].x, dy = s[j].y - s[i].y, d = Math.hypot(dx, dy);
        const min = s[i].r + s[j].r + separacion;
        if (d < min - 0.001) {
          ok = false;
          if (d < 0.001) { dx = azar(-1, 1); dy = azar(-1, 1); d = Math.hypot(dx, dy); }
          const emp = (min - d) / 2 + 0.01;
          s[i].x -= dx / d * emp; s[i].y -= dy / d * emp;
          s[j].x += dx / d * emp; s[j].y += dy / d * emp;
        }
      }
      for (const p of s) {
        const dx = p.x - 50, dy = p.y - 50, d = Math.hypot(dx, dy), lim = radioCarta - p.r;
        if (d > lim) { ok = false; p.x = 50 + dx / d * lim; p.y = 50 + dy / d * lim; }
      }
    }
    if (ok) return s.map((p) => ({ x: p.x, y: p.y, tam: p.r / forma }));
    if (intento % 4 === 3) escala *= 0.97;
  }
}

function dibujarCarta(contenedor, indice) {
  contenedor.innerHTML = '';
  let simbolos, posiciones;
  if (USAR_DISENO) {
    // Carta del juego físico: posición, tamaño y rotación exactos del diseño
    const diseno = window.CARTAS_DISENO[indice];
    simbolos = diseno.map((s) => s.s - 1);
    posiciones = diseno.map(({ x, y, tam, rot }) => ({ x, y, tam, rot }));
  } else {
    simbolos = barajar(CARTAS[indice]);
    posiciones = ubicarSimbolos(tamanosAleatorios()).map((p) => ({ ...p, rot: Math.round(azar(-180, 180)) }));
  }

  simbolos.forEach((sim, i) => {
    const { x, y, tam, rot } = posiciones[i];
    const btn = document.createElement('button');
    btn.className = 'simbolo';
    btn.dataset.simbolo = sim;
    btn.style.left = `${x}%`;
    btn.style.top = `${y}%`;
    btn.style.width = `${tam}%`;
    btn.style.height = `${tam}%`;
    btn.style.setProperty('--rot', `${rot}deg`);
    btn.innerHTML = `<img src="${CONFIG.rutaSimbolo(sim + 1)}" alt="" draggable="false">`;
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); tocarSimbolo(btn); });
    contenedor.appendChild(btn);
  });
}

function sacarCarta() {
  if (estado.mazo.length === 0) estado.mazo = barajar([...CARTAS.keys()]);
  return estado.mazo.pop();
}

function nuevaRonda() {
  const a = sacarCarta();
  let b = sacarCarta();
  if (b === a) b = sacarCarta();
  estado.cartaA = CARTAS[a];
  estado.cartaB = CARTAS[b];

  const elA = $('#carta-a'), elB = $('#carta-b');
  dibujarCarta(elA, a);
  dibujarCarta(elB, b);
  limpiarSeleccion();

  // pequeña animación de entrada
  [elA, elB].forEach((el) => {
    el.classList.remove('saliendo');
    el.classList.add('entrando');
    void el.offsetWidth;
    el.classList.remove('entrando');
  });
  estado.bloqueado = false;
}

function simboloComun() {
  return estado.cartaA.find((s) => estado.cartaB.includes(s));
}

/* ---------- Interacción ---------- */
/* El jugador elige libremente un símbolo en cada carta (sin pistas).
   Tocar otro símbolo de la misma carta cambia la selección.
   Cuando hay uno elegido en cada carta, se evalúa:
   - mismo símbolo → acierto (verde)
   - distinto       → error (rojo)
   En ambos casos, después se reparten cartas nuevas. */
function limpiarSeleccion() {
  estado.seleccion = { 'carta-a': null, 'carta-b': null };
  $$('.simbolo.seleccionado').forEach((b) => b.classList.remove('seleccionado'));
}

function tocarSimbolo(btn) {
  if (estado.bloqueado) return;
  const carta = btn.closest('.carta').id;

  // marcar (o cambiar) la selección de esta carta
  if (estado.seleccion[carta]) estado.seleccion[carta].classList.remove('seleccionado');
  estado.seleccion[carta] = btn;
  btn.classList.add('seleccionado');

  const a = estado.seleccion['carta-a'];
  const b = estado.seleccion['carta-b'];
  if (!a || !b) return; // falta elegir en la otra carta

  // --- evaluar el par ---
  estado.bloqueado = true;
  const esPar = a.dataset.simbolo === b.dataset.simbolo;
  [a, b].forEach((el) => {
    el.classList.remove('seleccionado');
    el.classList.add(esPar ? 'correcto' : 'error');
  });

  if (esPar) {
    estado.aciertos++;
  } else if (CONFIG.penalizacionError > 0) {
    estado.restante = Math.max(0, estado.restante - CONFIG.penalizacionError);
  }
  actualizarHUD();

  setTimeout(() => {
    if (estado.aciertos >= CONFIG.aciertosParaGanar) return terminar(true);
    if (estado.restante <= 0) return; // el reloj ya terminó la partida
    $$('.carta').forEach((c) => c.classList.add('saliendo'));
    setTimeout(nuevaRonda, 250);
  }, CONFIG.retrasoTrasRespuesta);
}

function formatoTiempo(s) {
  const seg = Math.ceil(s);
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
}

function actualizarHUD() {
  $('#tiempo').textContent = formatoTiempo(estado.restante);
  $('#aciertos').textContent = estado.aciertos;
  $('.hud').classList.toggle('urgente', estado.restante <= CONFIG.segundosUrgente);
}

/* ---------- Flujo de partida ---------- */
function iniciarJuego() {
  clearTimeout(estado.autoInicio);
  estado.aciertos = 0;
  estado.restante = CONFIG.tiempoSegundos;
  estado.mazo = [];
  $('#meta').textContent = CONFIG.aciertosParaGanar;
  actualizarHUD();
  nuevaRonda();
  mostrarPantalla('pantalla-juego');

  const fin = Date.now() + estado.restante * 1000;
  let finAjustado = fin;
  clearInterval(estado.timer);
  estado.timer = setInterval(() => {
    // si hubo penalización, se ajusta el fin
    finAjustado = Math.min(finAjustado, Date.now() + estado.restante * 1000);
    estado.restante = Math.max(0, (finAjustado - Date.now()) / 1000);
    actualizarHUD();
    if (estado.restante <= 0) terminar(false);
  }, 100);
}

function terminar(gano) {
  clearInterval(estado.timer);
  estado.bloqueado = true;
  $$('.final-aciertos').forEach((el) => (el.textContent = estado.aciertos));
  $$('.final-meta').forEach((el) => (el.textContent = CONFIG.aciertosParaGanar));
  mostrarPantalla(gano ? 'pantalla-ganaste' : 'pantalla-perdiste');

  if (CONFIG.volverAlInicio > 0) {
    estado.autoInicio = setTimeout(() => mostrarPantalla('pantalla-inicio'), CONFIG.volverAlInicio * 1000);
  }
}

$('#btn-iniciar').addEventListener('click', iniciarJuego);
$$('.btn-reiniciar').forEach((b) => b.addEventListener('click', () => {
  clearTimeout(estado.autoInicio);
  mostrarPantalla('pantalla-inicio');
}));
