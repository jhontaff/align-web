/**
 * Compila los iconos que usa la app desde el set oficial de Iconify
 * (`@iconify-json/bi`, Bootstrap Icons) a un registro TypeScript local.
 *
 * Por qué generado y no consumido en runtime: el componente web `iconify-icon`
 * resuelve los iconos contra `api.iconify.design` en tiempo de ejecución. Eso
 * mete un tercero en el arranque de una app que es un shell PWA detrás de
 * login, y sus iconos no pintan sin red — el Service Worker no cachea esa API
 * (`ngsw-config.json` no tiene `dataGroups` a propósito). Compilando solo los
 * iconos usados el bundle crece unos pocos KB, no hay peticiones y el set
 * sigue siendo el de Iconify: mismos nombres, mismos paths.
 *
 * Uso: `npm run icons` tras añadir un nombre a ICON_NAMES.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Los iconos que la app usa hoy. Nombres tal cual los lista iconify.design. */
const ICON_NAMES = [
  'bi:house-door',
  'bi:check2-circle',
  'bi:wallet2',
  'bi:calendar-check',
  'bi:plus-lg',
  'bi:check-lg',
  'bi:robot',
  'bi:chat-dots',
  'bi:mic-fill',
  'bi:sun',
  'bi:moon-stars',
  'bi:display',
  'bi:three-dots-vertical',
  'bi:x-lg',
  'bi:box-arrow-right',
  'bi:arrow-left',
  'bi:arrow-right',
  'bi:trash3',
  'bi:send'
];

const OUT = 'src/app/shared/ui/icon/icon-set.ts';

/** Sets cargados bajo demanda, por si algún día entra una segunda familia. */
const sets = new Map();

function loadSet(prefix) {
  if (!sets.has(prefix)) {
    const path = require.resolve(`@iconify-json/${prefix}/icons.json`);
    sets.set(prefix, JSON.parse(readFileSync(path, 'utf8')));
  }
  return sets.get(prefix);
}

function resolve(fullName) {
  const [prefix, name] = fullName.split(':');
  const set = loadSet(prefix);

  // Un alias no tiene `body` propio: apunta a otro icono, a veces con rotación.
  // Solo se sigue el `parent`; si algún alias necesitara transformaciones se
  // vería aquí en vez de salir torcido en pantalla.
  const alias = set.aliases?.[name];
  const icon = set.icons[name] ?? (alias ? set.icons[alias.parent] : undefined);

  if (!icon) {
    throw new Error(`Icono desconocido en el set "${prefix}": ${fullName}`);
  }

  const width = icon.width ?? set.width ?? 16;
  const height = icon.height ?? set.height ?? 16;

  return { body: icon.body, viewBox: `0 0 ${width} ${height}` };
}

const entries = [...ICON_NAMES].sort().map(fullName => {
  const { body, viewBox } = resolve(fullName);
  return `  '${fullName}': { viewBox: '${viewBox}', body: '${body.replace(/'/g, "\'")}' }`;
});

const file = `// GENERADO POR tools/generate-icons.mjs — NO EDITAR A MANO.
// Fuente: @iconify-json/bi (Bootstrap Icons vía Iconify). Regenerar: npm run icons

export interface IconDefinition {
  readonly viewBox: string;
  readonly body: string;
}

export const ICONS = {
${entries.join(',\n')}
} as const satisfies Record<string, IconDefinition>;

/**
 * La union de nombres disponibles.
 *
 * Es lo que convierte una errata en el nombre de un icono en un error de
 * compilación con \`strictTemplates\`, en vez de en un hueco vacío en pantalla.
 */
export type IconName = keyof typeof ICONS;
`;

writeFileSync(OUT, file);
console.log(`${entries.length} iconos escritos en ${OUT}`);
