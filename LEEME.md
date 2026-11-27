# ¿Estás viendo doble? – La Crianza

Abrir `index.html` en el navegador (pantalla vertical 9:16, se escala sola).

## Qué reemplazar
| Elemento | Archivo |
|---|---|
| Logo | `assets/img/logo.svg` (si usas PNG, cambia la ruta en `index.html`, 4 veces) |
| Imagen principal (inicio) | `assets/img/hero.svg` → ideal PNG con fondo transparente |
| 31 símbolos | `assets/simbolos/simbolo-01.svg` … `simbolo-31.svg` (mismo nombre, formato cuadrado) |
| Fuentes y colores | variables al inicio de `css/estilos.css` (`--font-*`, `--color-*`, `--fondo-imagen`) |
| Pantallas Ganaste / Perdiste | secciones `#pantalla-ganaste` y `#pantalla-perdiste` en `index.html` |

## Ajustes del juego
Al inicio de `js/juego.js`, objeto `CONFIG`: tiempo (60 s), aciertos para ganar (5),
penalización por error, segundos antes de volver solo al inicio, etc.

## Por qué 31 símbolos
Con 6 símbolos por carta y 31 cartas donde cualquier par comparte exactamente uno,
se necesitan 31 símbolos (plano proyectivo de orden 5). La consola del navegador
confirma la validez de las cartas al cargar.
