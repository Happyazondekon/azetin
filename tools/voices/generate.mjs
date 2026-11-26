// =============================================================
//  AZETIN — génère les voix, les bruitages et la musique avec ElevenLabs
//    node tools/voices/generate.mjs            (tout ce qui manque)
//    node tools/voices/generate.mjs lines      (seulement les répliques)
//    node tools/voices/generate.mjs sfx        (seulement les bruitages)
//    node tools/voices/generate.mjs music      (seulement la musique)
//    node tools/voices/generate.mjs --force    (refait même ce qui existe)
//
//  La clé API est lue dans le fichier .env à la racine (ELEVENLABS_API_KEY=...).
//  Ce fichier n'est jamais versionné (.gitignore). Ne la colle nulle part ailleurs.
//
//  Sorties :
//    public/voices/lines/<id>.mp3   répliques (src/story/lines.json, voix choisies dans "_voices")
//    public/sfx/<nom>.mp3           bruitages (tools/voices/sfx.json)
//    public/music/<nom>.mp3         musique
//  Le jeu utilise automatiquement les fichiers présents ; sinon, il garde les sons de secours.
// =============================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const API = 'https://api.elevenlabs.io/v1';

// --- clé API depuis .env
function readKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = /^\s*ELEVENLABS_API_KEY\s*=\s*(.+)\s*$/.exec(line);
      if (m) return m[1].replace(/^["']|["']$/g, '');
    }
  }
  console.error('Clé manquante : crée un fichier .env à la racine du projet avec la ligne ELEVENLABS_API_KEY=ta_clé');
  process.exit(1);
}
const KEY = readKey();
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));
const want = (k) => !only.length || only.includes(k);

async function post(path, body, query = '') {
  const res = await fetch(`${API}${path}${query}`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

const out = (dir) => { const d = join(ROOT, dir); mkdirSync(d, { recursive: true }); return d; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- répliques
async function lines() {
  const all = JSON.parse(readFileSync(join(ROOT, 'src/story/lines.json'), 'utf8'));
  const cast = all._voices;
  // retrouver les voix par leur nom dans « Mes voix » du compte
  const res = await fetch(`${API}/voices`, { headers: { 'xi-api-key': KEY } });
  if (!res.ok) throw new Error(`voices ${res.status} ${await res.text()}`);
  const { voices } = await res.json();
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const ids = {};
  for (const [who, name] of Object.entries(cast)) {
    const v = voices.find((x) => norm(x.name).includes(norm(name)));
    if (!v) console.warn(`! Voix « ${name} » (${who}) introuvable dans tes voix ElevenLabs : ajoute-la depuis la Voice Library, ou change "_voices" dans src/story/lines.json`);
    else ids[who] = v.voice_id;
  }
  // réglages par personnage : les morts parlent plus lentement, plus stables
  const settings = {
    happy: { stability: 0.4, similarity_boost: 0.8, style: 0.35 },
    kossi: { stability: 0.55, similarity_boost: 0.8, style: 0.25 },
    dossi: { stability: 0.7, similarity_boost: 0.75, style: 0.15 },
    ayaba: { stability: 0.6, similarity_boost: 0.8, style: 0.2 },
    radio: { stability: 0.6, similarity_boost: 0.75, style: 0.1 },
    houngbo: { stability: 0.6, similarity_boost: 0.8, style: 0.3 },
    agossou: { stability: 0.75, similarity_boost: 0.8, style: 0.2 },
  };
  const dir = out('public/voices/lines');
  for (const [id, line] of Object.entries(all)) {
    if (id.startsWith('_')) continue;
    const file = join(dir, `${id}.mp3`);
    if (existsSync(file) && !FORCE) continue;
    const vid = ids[line.who];
    if (!vid) continue;
    process.stdout.write(`voix  ${id} (${line.who})… `);
    try {
      const buf = await post(`/text-to-speech/${vid}`, {
        text: line.text, model_id: 'eleven_multilingual_v2', voice_settings: settings[line.who] ?? { stability: 0.5, similarity_boost: 0.8 },
      }, '?output_format=mp3_44100_64');
      writeFileSync(file, buf);
      console.log(`${Math.round(buf.length / 1024)} Ko`);
    } catch (e) { console.log(`ÉCHEC ${e.message.slice(0, 160)}`); }
    await wait(300);
  }
}

// ---------------------------------------------------------------- bruitages
async function sfx() {
  const list = JSON.parse(readFileSync(join(ROOT, 'tools/voices/sfx.json'), 'utf8'));
  const dir = out('public/sfx');
  for (const [name, s] of Object.entries(list)) {
    const file = join(dir, `${name}.mp3`);
    if (existsSync(file) && !FORCE) continue;
    process.stdout.write(`sfx   ${name}… `);
    try {
      const buf = await post('/sound-generation', {
        text: s.text, duration_seconds: s.seconds, prompt_influence: 0.45, loop: !!s.loop, model_id: 'eleven_text_to_sound_v2',
      }, '?output_format=mp3_44100_64');
      writeFileSync(file, buf);
      console.log(`${Math.round(buf.length / 1024)} Ko`);
    } catch (e) { console.log(`ÉCHEC ${e.message.slice(0, 160)}`); }
    await wait(300);
  }
}

// ---------------------------------------------------------------- musique
async function music() {
  const tracks = {
    theme: { prompt: 'Slow haunting West African horror theme: a kora playing a sparse minor melody, a low talking drum like a heartbeat, distant female choir humming, dark ambient pads, cinematic, unsettling, instrumental', ms: 90000 },
    tension: { prompt: 'Dark tense horror underscore for being chased at night in an African village: pulsing low drums, dissonant strings, breathing textures, no melody, loopable, instrumental', ms: 45000 },
  };
  const dir = out('public/music');
  for (const [name, t] of Object.entries(tracks)) {
    const file = join(dir, `${name}.mp3`);
    if (existsSync(file) && !FORCE) continue;
    process.stdout.write(`music ${name}… `);
    try {
      const buf = await post('/music', { prompt: t.prompt, music_length_ms: t.ms, model_id: 'music_v2', force_instrumental: true }, '?output_format=mp3_44100_64');
      writeFileSync(file, buf);
      console.log(`${Math.round(buf.length / 1024)} Ko`);
    } catch (e) { console.log(`ÉCHEC ${e.message.slice(0, 160)} (la musique demande un forfait qui l'inclut)`); }
  }
}

if (want('lines')) await lines();
if (want('sfx')) await sfx();
if (want('music')) await music();
console.log('\nTerminé. Lance le jeu (lancer-jeu.bat) : les nouveaux sons sont utilisés automatiquement.');
