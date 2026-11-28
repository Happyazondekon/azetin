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
// Le casting : les voix de la bibliothèque choisies pour chaque personnage, et deux voix créées sur mesure
// (Voice Design) pour Houngbo et Dah Agossou. Le jeu des acteurs passe par des indications entre crochets
// (« audio tags » des modèles v3/v4) : elles ne s'affichent jamais dans les sous-titres.
const DESIGN = {
  houngbo: {
    name: 'AZETIN Houngbo',
    description: 'An imposing, menacing West African village chief in his sixties, now a burnt ghost. A very deep, low bass voice, slow and authoritative, dark and gravelly, with a cruel smile in every word. A horror villain who never raises his voice because he never needs to. Light Beninese accent.',
    sample: 'Welcome, traveller. You are far from home, and the night is long in Azé-tin. Sit. Drink. Nobody here will hurt you... as long as you do exactly what I say. My people are hungry, and I am a generous chief.',
  },
  agossou: {
    name: 'AZETIN Dah Agossou',
    description: 'An old West African healer in his seventies, the protector and saviour of his village. A warm, deep and calm voice, wise and solemn, slightly hoarse, speaking slowly as if reciting a proverb. Reassuring and gentle, yet powerful when he commands. Light Beninese accent.',
    sample: 'Do not be afraid, my child. The ancestors walk beside those who come with a clean heart. Take the white earth, keep the calabash close, and listen to the hornbill. Tonight, a living one can bring our dead home.',
  },
};
// Indication de jeu par défaut pour chaque personnage (une réplique peut avoir la sienne : champ "tag")
const TONE = {
  houngbo: '[menacing] [slow, deep voice]',
  agossou: '[calm, solemn]',
  kossi: '[gruff, tired]',
  dossi: '[sweetly] [unsettling]',
  ayaba: '[softly]',
  happy: '',
  radio: '',
};
const settingsFor = {
  happy: { stability: 0.4, similarity_boost: 0.8, style: 0.35 },
  kossi: { stability: 0.55, similarity_boost: 0.8, style: 0.25 },
  dossi: { stability: 0.7, similarity_boost: 0.75, style: 0.15 },
  ayaba: { stability: 0.6, similarity_boost: 0.8, style: 0.2 },
  radio: { stability: 0.6, similarity_boost: 0.75, style: 0.1 },
  houngbo: { stability: 0.5, similarity_boost: 0.85, style: 0.45 },
  agossou: { stability: 0.6, similarity_boost: 0.85, style: 0.25 },
};
// du plus expressif au plus ancien : on prend le premier que le compte accepte
const MODELS = ['eleven_v4', 'eleven_v3', 'eleven_multilingual_v2'];
const tagged = (m) => m !== 'eleven_multilingual_v2';

async function getJSON(path) {
  const res = await fetch(`${API}${path}`, { headers: { 'xi-api-key': KEY } });
  if (!res.ok) throw new Error(`${path} ${res.status} ${await res.text()}`);
  return res.json();
}
async function postJSON(path, body) {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} ${res.status} ${await res.text()}`);
  return res.json();
}

// Voice Design : 3 essais enregistrés dans tools/voices/essais/, le 1er devient la voix du personnage.
// Pour en garder un autre (dans les 24 h) : generer-voix.bat choisir houngbo 2
async function design(who, voices) {
  const d = DESIGN[who];
  const have = voices.find((v) => v.name === d.name);
  if (have) return have.voice_id;
  console.log(`\nCréation de la voix de ${who} (Voice Design)…`);
  const r = await postJSON('/text-to-voice/design', { voice_description: d.description, text: d.sample, model_id: 'eleven_ttv_v3', guidance_scale: 6, loudness: 0.6 });
  const dir = out('tools/voices/essais');
  const ids = [];
  r.previews.forEach((pv, i) => {
    writeFileSync(join(dir, `${who}-${i + 1}.mp3`), Buffer.from(pv.audio_base_64, 'base64'));
    ids.push(pv.generated_voice_id);
  });
  writeFileSync(join(dir, `${who}.json`), JSON.stringify({ ids, at: Date.now() }, null, 1));
  console.log(`  ${ids.length} essais enregistrés dans tools/voices/essais/${who}-1..${ids.length}.mp3 — le n°1 est gardé.`);
  const v = await postJSON('/text-to-voice', { voice_name: d.name, voice_description: d.description, generated_voice_id: ids[0] });
  return v.voice_id;
}

// generer-voix.bat choisir houngbo 2 : remplace la voix par un autre essai, puis refait ses répliques
async function choose(who, n) {
  const d = DESIGN[who];
  if (!d) { console.error(`Personnage inconnu : ${who} (houngbo ou agossou)`); process.exit(1); }
  const f = join(ROOT, 'tools/voices/essais', `${who}.json`);
  if (!existsSync(f)) { console.error('Aucun essai enregistré : lance d’abord generer-voix.bat'); process.exit(1); }
  const { ids } = JSON.parse(readFileSync(f, 'utf8'));
  const gid = ids[n - 1];
  if (!gid) { console.error(`Il n'y a que ${ids.length} essais.`); process.exit(1); }
  const { voices } = await getJSON('/voices');
  for (const v of voices.filter((x) => x.name === d.name)) {
    await fetch(`${API}/voices/${v.voice_id}`, { method: 'DELETE', headers: { 'xi-api-key': KEY } });
  }
  await postJSON('/text-to-voice', { voice_name: d.name, voice_description: d.description, generated_voice_id: gid });
  console.log(`Voix de ${who} remplacée par l'essai n°${n}. Ses répliques vont être refaites.`);
}

async function lines(onlyWho) {
  const all = JSON.parse(readFileSync(join(ROOT, 'src/story/lines.json'), 'utf8'));
  const cast = all._voices;
  const { voices } = await getJSON('/voices');
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const ids = {};
  for (const [who, name] of Object.entries(cast)) {
    if (DESIGN[who]) {
      try { ids[who] = await design(who, voices); }
      catch (e) { console.warn(`! Voice Design impossible pour ${who} (${e.message.slice(0, 140)}) — on garde « ${name} »`); }
      if (ids[who]) continue;
    }
    const v = voices.find((x) => norm(x.name).includes(norm(name)));
    if (!v) console.warn(`! Voix « ${name} » (${who}) introuvable dans tes voix ElevenLabs : ajoute-la depuis la Voice Library, ou change "_voices" dans src/story/lines.json`);
    else ids[who] = v.voice_id;
  }

  // _texts.json : le texte exact de chaque voix (clé "id" en anglais, "fr:id" en français) — le jeu ne joue
  // jamais une voix qui ne correspond plus à son sous-titre. _meta.json : le modèle et la voix utilisés.
  const dir = out('public/voices/lines');
  const dirFr = out('public/voices/lines/fr');
  const recFile = join(dir, '_texts.json');
  const metaFile = join(dir, '_meta.json');
  const rec = existsSync(recFile) ? JSON.parse(readFileSync(recFile, 'utf8')) : {};
  const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {};
  const save = () => { writeFileSync(recFile, JSON.stringify(rec, null, 1)); writeFileSync(metaFile, JSON.stringify(meta, null, 1)); };

  let model = null;
  let chars = 0, made = 0, failed = 0;
  async function speak(vid, who, text, tag) {
    const tries = model ? [model] : MODELS;
    for (const m of tries) {
      const say = tagged(m) && tag ? `${tag} ${text}` : text;
      for (const withSettings of [true, false]) {
        try {
          const body = { text: say, model_id: m };
          if (withSettings) body.voice_settings = settingsFor[who] ?? { stability: 0.5, similarity_boost: 0.8 };
          const buf = await post(`/text-to-speech/${vid}`, body, '?output_format=mp3_44100_96');
          if (!model) { model = m; console.log(`Modèle utilisé : ${m}${tagged(m) ? ' (avec indications de jeu)' : ''}`); }
          chars += say.length;
          return buf;
        } catch (e) {
          const msg = String(e.message);
          // réglages refusés par ce modèle : on réessaie sans ; modèle refusé : on passe au suivant
          if (withSettings && /voice_settings|stability|style/i.test(msg)) continue;
          if (!model && /model|not (allowed|available)|permission|tier|subscription|invalid/i.test(msg)) break;
          throw e;
        }
      }
    }
    throw new Error('aucun modèle disponible pour ce compte');
  }

  for (const [id, line] of Object.entries(all)) {
    if (id.startsWith('_')) continue;
    if (onlyWho && line.who !== onlyWho) continue;
    const vid = ids[line.who];
    if (!vid) continue;
    const tag = line.tag ?? TONE[line.who] ?? '';
    for (const [lang, text, folder, key] of [['en', line.text, dir, id], ['fr', line.fr, dirFr, `fr:${id}`]]) {
      if (!text) continue;
      const file = join(folder, `${id}.mp3`);
      const stamp = { voice: vid, tag };
      const same = existsSync(file) && rec[key] === text && meta[key] && meta[key].voice === vid && meta[key].tag === tag && (!model || meta[key].model === model);
      if (same && !FORCE && !onlyWho) continue;
      process.stdout.write(`voix  ${lang} ${id} (${line.who})… `);
      try {
        const buf = await speak(vid, line.who, text, tag);
        writeFileSync(file, buf);
        rec[key] = text; meta[key] = { ...stamp, model }; save();
        made++;
        console.log(`${Math.round(buf.length / 1024)} Ko`);
      } catch (e) { failed++; console.log(`ÉCHEC ${e.message.slice(0, 160)}`); }
      await wait(250);
    }
  }
  console.log(`\nVoix : ${made} générées, ${failed} en échec, environ ${chars} caractères utilisés.`);
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
    rite: { prompt: 'West African healing ritual chant at night: a deep male voice and a choir humming, talking drums, rattles and a kora, rising and solemn, hopeful by the end, instrumental feel with wordless voices', ms: 120000 },
    dawn: { prompt: 'Peaceful dawn over an African lagoon after a long night: soft kora, gentle strings, birds, warm and bittersweet, instrumental', ms: 60000 },
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

if (only[0] === 'choisir') { await choose(only[1], Number(only[2] || 1)); await lines(only[1]); process.exit(0); }
if (want('lines')) await lines();
if (want('sfx')) await sfx();
if (want('music')) await music();
console.log('\nTerminé. Lance le jeu (lancer-jeu.bat) : les nouveaux sons sont utilisés automatiquement.');
