#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const genshin = require('genshin-db');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const KB_DIR = path.join(PROJECT_ROOT, 'knowledge_base');
const CHARACTERS_DIR = path.join(KB_DIR, 'characters');

const EN = { resultLanguage: 'English', queryLanguages: ['English'], matchCategories: true };
const RU = { resultLanguage: 'Russian', queryLanguages: ['English', 'Russian'], matchCategories: true };

const TALENT_TYPES = {
  combat1: 'обычная',
  combat2: 'навык',
  combat3: 'ульта',
};

function main() {
  ensureDir(KB_DIR);
  resetDir(CHARACTERS_DIR);

  syncArtifacts();
  syncWeapons();
  syncCharacters();
  syncMaterials();

  console.log('Синхронизация базы знаний завершена.');
}

function syncArtifacts() {
  console.log('Синхронизация артефактов...');
  const names = getNames('artifacts');
  const artifacts = [];

  names.forEach((name, index) => {
    const artifactEn = genshin.artifacts(name, EN);
    const artifactRu = genshin.artifacts(name, RU);
    if (!artifactEn || !artifactRu) return;

    artifacts.push({
      id: slugify(artifactEn.name),
      name_ru: artifactRu.name,
      name_en: artifactEn.name,
      max_rarity: Math.max(...asArray(artifactEn.rarityList)),
      bonus_2pc: artifactRu.effect2Pc || '',
      bonus_4pc: artifactRu.effect4Pc || '',
    });
    logProgress('Артефакты', index + 1, names.length);
  });

  writeJson(path.join(KB_DIR, 'artifacts.json'), artifacts);
  console.log(`Артефакты сохранены: ${artifacts.length}`);
}

function syncWeapons() {
  console.log('Синхронизация оружия...');
  const names = getNames('weapons');
  const weapons = [];

  names.forEach((name, index) => {
    const weaponEn = genshin.weapons(name, EN);
    const weaponRu = genshin.weapons(name, RU);
    if (!weaponEn || !weaponRu) return;

    weapons.push({
      id: slugify(weaponEn.name),
      name_ru: weaponRu.name,
      name_en: weaponEn.name,
      weapon_type: weaponEn.weaponText,
      rarity: weaponEn.rarity,
      stats: buildWeaponStats(weaponEn, weaponRu),
      passive_name_ru: weaponRu.effectName || '',
      passive_description_ru: weaponRu.r1?.description || '',
      ascension_materials: buildWeaponAscensionMaterials(weaponEn, weaponRu),
    });
    logProgress('Оружие', index + 1, names.length);
  });

  writeJson(path.join(KB_DIR, 'weapons.json'), weapons);
  console.log(`Оружие сохранено: ${weapons.length}`);
}

function syncCharacters() {
  console.log('Синхронизация персонажей...');
  const names = getNames('characters');

  names.forEach((name, index) => {
    const characterEn = genshin.characters(name, EN);
    const characterRu = genshin.characters(name, RU);
    if (!characterEn || !characterRu) return;

    const character = {
      id: slugify(characterEn.name),
      name_ru: characterRu.fullname || characterRu.name,
      name_en: characterEn.fullname || characterEn.name,
      element: characterEn.elementText,
      weapon_type: characterEn.weaponText,
      rarity: characterEn.rarity,
      stats: buildCharacterStats(characterEn),
      talents: buildCharacterTalents(characterEn.name),
    };

    writeJson(path.join(CHARACTERS_DIR, `${character.id}.json`), character);
    logProgress('Персонажи', index + 1, names.length);
  });

  console.log(`Персонажи сохранены: ${names.length}`);
}

function syncMaterials() {
  console.log('Синхронизация материалов...');
  const names = getNames('materials');
  const materials = [];

  names.forEach((name, index) => {
    const materialEn = genshin.materials(name, EN);
    const materialRu = genshin.materials(name, RU);
    if (!materialEn || !materialRu) return;

    materials.push({
      id: slugify(materialEn.name),
      name_ru: materialRu.name,
      name_en: materialEn.name,
      type: classifyMaterial(materialEn, materialRu),
      type_text_ru: materialRu.typeText || '',
      days_of_week_ru: asArray(materialRu.daysOfWeek),
      source_ru: asArray(materialRu.source),
    });
    logProgress('Материалы', index + 1, names.length);
  });

  writeJson(path.join(KB_DIR, 'materials.json'), materials);
  console.log(`Материалы сохранены: ${materials.length}`);
}

function buildWeaponStats(weaponEn, weaponRu) {
  const enLevel1 = safeStats(weaponEn, 1);
  const enLevel90 = safeStats(weaponEn, 90);
  const ruLevel1 = safeStats(weaponRu, 1);
  const ruLevel90 = safeStats(weaponRu, 90);

  return {
    level_1: {
      base_atk: roundStat(enLevel1.attack),
      secondary_stat: weaponRu.mainStatText || weaponEn.mainStatText || null,
      secondary_stat_value: roundStat(ruLevel1.specialized ?? enLevel1.specialized),
    },
    level_90: {
      base_atk: roundStat(enLevel90.attack),
      secondary_stat: weaponRu.mainStatText || weaponEn.mainStatText || null,
      secondary_stat_value: roundStat(ruLevel90.specialized ?? enLevel90.specialized),
    },
  };
}

function buildCharacterStats(characterEn) {
  const level1 = safeStats(characterEn, 1);
  const level90 = safeStats(characterEn, 90);
  return {
    level_1: {
      hp: roundStat(level1.hp),
      atk: roundStat(level1.attack),
      def: roundStat(level1.defense),
    },
    level_90: {
      hp: roundStat(level90.hp),
      atk: roundStat(level90.attack),
      def: roundStat(level90.defense),
    },
  };
}

function buildCharacterTalents(characterNameEn) {
  const talentsRu = genshin.talents(characterNameEn, RU);
  if (!talentsRu) return [];

  return Object.entries(TALENT_TYPES)
    .map(([key, type]) => {
      const talent = talentsRu[key];
      if (!talent) return null;
      return {
        type,
        name_ru: talent.name || '',
        description_ru: talent.description || '',
      };
    })
    .filter(Boolean);
}

function buildWeaponAscensionMaterials(weaponEn, weaponRu) {
  return {
    domain_materials: collectCostSlot(weaponEn.costs, weaponRu.costs, 1),
    elite_drops: collectCostSlot(weaponEn.costs, weaponRu.costs, 2),
    common_drops: collectCostSlot(weaponEn.costs, weaponRu.costs, 3),
  };
}

function collectCostSlot(costsEn, costsRu, itemIndex) {
  const byId = new Map();
  for (const phase of Object.keys(costsEn || {}).sort()) {
    const enItem = costsEn?.[phase]?.[itemIndex];
    const ruItem = costsRu?.[phase]?.[itemIndex];
    if (!enItem || !ruItem || enItem.name === 'Mora') continue;
    byId.set(enItem.id, {
      id: slugify(enItem.name),
      name_ru: ruItem.name,
      name_en: enItem.name,
    });
  }
  return Array.from(byId.values());
}

function classifyMaterial(materialEn, materialRu) {
  const typeRu = String(materialRu.typeText || '').toLowerCase();
  const category = String(materialEn.category || '');
  const source = asArray(materialEn.source).join(' ').toLowerCase();

  if (typeRu.includes('талант')) return 'talent_material';
  if (typeRu.includes('возвышение оружия')) return 'weapon_material';
  if (typeRu.includes('возвышение персонаж')) return 'character_ascension_material';
  if (typeRu.includes('диковинка')) return 'local_specialty';
  if (typeRu.includes('улучшение персонажей/оружия')) return 'common_drop';
  if (category === 'ELEM_CRYSTAL') return 'elemental_gem';
  if (source.includes('boss') || source.includes('trounce')) return 'boss_drop';
  if (category === 'EXP_FRUIT') return 'character_exp';
  if (category === 'WEAPON_EXP_STONE') return 'weapon_exp';
  return normalizeType(materialEn.category || materialRu.typeText || 'unknown');
}

function getNames(folder) {
  const names = genshin[folder]('names', { matchCategories: true, resultLanguage: 'English' });
  return Array.isArray(names) ? names : [];
}

function safeStats(entity, level) {
  if (typeof entity?.stats !== 'function') return {};
  try {
    return entity.stats(level) || {};
  } catch {
    return {};
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resetDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDir(dirPath);
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function normalizeType(value) {
  return String(value || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

function roundStat(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return Number(value.toFixed(4));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function logProgress(label, current, total) {
  if (current === total || current === 1 || current % 25 === 0) {
    console.log(`${label}... [${current}/${total}]`);
  }
}

main();
