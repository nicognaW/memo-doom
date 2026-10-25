import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(appRoot, 'engine/vendor/doomgeneric/doomgeneric');
const outputRoot = resolve(appRoot, 'engine');
const emcc = process.env.EMCC_PY || (process.env.EMSDK && resolve(process.env.EMSDK, 'upstream/emscripten/emcc.py'));
if (!emcc) throw new Error('Set EMSDK to an activated Emscripten SDK, or EMCC_PY to emcc.py; see docs/BUILD.md');
const python = process.env.PYTHON || 'python';
const names = `dummy am_map doomdef doomstat dstrings d_event d_items d_iwad d_loop d_main d_mode d_net
  f_finale f_wipe g_game hu_lib hu_stuff info i_cdmus i_endoom i_joystick i_scale i_sound i_system
  i_timer memio m_argv m_bbox m_cheat m_config m_controls m_fixed m_menu m_misc m_random p_ceilng
  p_doors p_enemy p_floor p_inter p_lights p_map p_maputl p_mobj p_plats p_pspr p_saveg p_setup
  p_sight p_spec p_switch p_telept p_tick p_user r_bsp r_data r_draw r_main r_plane r_segs r_sky
  r_things sha1 sounds statdump st_lib st_stuff s_sound tables v_video wi_stuff w_checksum w_file
  w_main w_wad z_zone w_file_stdc i_input i_video doomgeneric`.split(/\s+/).filter(Boolean);
// Relative compiler inputs keep __FILE__ diagnostics portable and avoid embedding local paths.
const sources = names.map((name) => relative(appRoot, resolve(sourceRoot, `${name}.c`)).split(sep).join('/'));
sources.push('engine/doomgeneric_memomind.c');
mkdirSync(outputRoot, { recursive: true });

const common = [
  ...sources,
  '-DCMAP256', '-DMEMOMIND', '-DDOOMGENERIC_RESX=320', '-DDOOMGENERIC_RESY=200',
  '-Iengine/vendor/doomgeneric/doomgeneric', '-O2', '-Wall', '-Wextra', '-Wno-unused-parameter', '-Wno-sign-compare',
  '-sMODULARIZE=1', '-sEXPORT_NAME=createDoomEngine', '-sEXPORT_ES6=1', '-sENVIRONMENT=web,worker,node',
  '-sINITIAL_MEMORY=67108864', '-sALLOW_MEMORY_GROWTH=1', '-sMAXIMUM_MEMORY=134217728',
  '-sNO_EXIT_RUNTIME=1', '-sINVOKE_RUN=0', '-sFORCE_FILESYSTEM=1', '-sASSERTIONS=1',
  '-sDISABLE_EXCEPTION_CATCHING=1', '-sSTACK_SIZE=1048576',
  '-sEXPORTED_FUNCTIONS=_main,_malloc,_free,_doomgeneric_Tick,_MM_QueueKey,_MM_ReleaseKeys,_MM_ConsumeFrame,_MM_Frame,_MM_Palette,_MM_GameState,_MM_GameTic,_MM_PlayerX,_MM_PlayerY,_MM_PlayerAngle,_MM_InputOverflows,_MM_PlayerHealth,_MM_PlayerArmor,_MM_PlayerWeapon,_MM_PlayerAmmo,_MM_PlayerWeapons,_MM_PlayerKeys,_MM_MenuActive,_MM_DemoPlayback',
  '-sEXPORTED_RUNTIME_METHODS=FS,callMain,ccall,cwrap,getValue,setValue,UTF8ToString,stringToUTF8,HEAPU8',
  '-sINCOMING_MODULE_JS_API=locateFile,wasmBinary,print,printErr,onRuntimeInitialized,preRun,postRun',
];

for (const [suffix, wasm] of [['doom', 1], ['doom-js', 0]]) {
  const output = resolve(outputRoot, `${suffix}.js`);
  const args = [...common, `-sWASM=${wasm}`, '-o', output];
  const result = spawnSync(python, [emcc, ...args], { cwd: appRoot, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`${suffix}: ${statSync(output).size} bytes`);
}
