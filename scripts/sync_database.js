#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const genshin = require('genshin-db');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const KB_DIR = path.join(PROJECT_ROOT, 'knowledge_base');
const ARTIFACTS_DIR = path.join(KB_DIR, 'artifacts');
const WEAPONS_DIR = path.join(KB_DIR, 'weapons');
const MATERIALS_DIR = path.join(KB_DIR, 'materials');
const ENEMIES_DIR = path.join(KB_DIR, 'enemies');
const DOMAINS_DIR = path.join(KB_DIR, 'domains');
const FOOD_DIR = path.join(KB_DIR, 'food');
const FISHING_DIR = path.join(KB_DIR, 'fishing');
const CHARACTERS_DIR = path.join(KB_DIR, 'characters');
const VERSIONS_DIR = path.join(KB_DIR, 'versions');

const EN = { resultLanguage: 'English', queryLanguages: ['English'], matchCategories: true };
const RU = { resultLanguage: 'Russian', queryLanguages: ['English', 'Russian'], matchCategories: true };

const COMBAT_TALENT_TYPES = {
  combat1: 'обычная',
  combat2: 'навык',
  combat3: 'ульта',
};

const PASSIVE_TALENT_TYPES = {
  passive1: 'пассивный талант 1',
  passive2: 'пассивный талант 2',
  passive3: 'пассивный талант 3',
  passive4: 'пассивный талант 4',
};

const IGNORED_ENEMY_REWARD_NAMES = new Set([
  'Adventure EXP',
  'Companionship EXP',
  'Mora',
]);

function main() {
  ensureDir(KB_DIR);
  resetDir(ARTIFACTS_DIR);
  resetDir(WEAPONS_DIR);
  resetDir(MATERIALS_DIR);
  resetDir(ENEMIES_DIR);
  resetDir(DOMAINS_DIR);
  resetDir(FOOD_DIR);
  resetDir(FISHING_DIR);
  resetDir(CHARACTERS_DIR);
  resetDir(VERSIONS_DIR);
  removeLegacyFiles();

  syncArtifacts();
  syncWeapons();
  syncCharacters();
  const artifactIds = getEntityIds('artifacts');
  const materialIds = syncMaterials();
  syncDomains(materialIds, artifactIds);
  syncEnemies(materialIds);
  syncFood();
  syncFishing();
  syncVersions();

  console.log('Синхронизация базы знаний завершена.');
}

function syncArtifacts() {
  console.log('Синхронизация артефактов...');
  const names = getNames('artifacts');
  let saved = 0;

  names.forEach((name, index) => {
    const artifactEn = genshin.artifacts(name, EN);
    const artifactRu = genshin.artifacts(name, RU);
    if (!artifactEn || !artifactRu) return;

    const artifact = {
      id: slugify(artifactEn.name),
      name_ru: artifactRu.name,
      name_en: artifactEn.name,
      max_rarity: Math.max(...asArray(artifactEn.rarityList)),
      bonus_2pc: artifactRu.effect2Pc || '',
      bonus_4pc: artifactRu.effect4Pc || '',
      source_domain: null,
      coordinates: [],
    };

    writeJson(path.join(ARTIFACTS_DIR, `${artifact.id}.json`), artifact);
    saved += 1;
    logProgress('Артефакты', index + 1, names.length);
  });

  console.log(`Артефакты сохранены: ${saved}`);
}

function syncWeapons() {
  console.log('Синхронизация оружия...');
  const names = getNames('weapons');
  let saved = 0;

  names.forEach((name, index) => {
    const weaponEn = genshin.weapons(name, EN);
    const weaponRu = genshin.weapons(name, RU);
    if (!weaponEn || !weaponRu) return;

    const weapon = {
      id: slugify(weaponEn.name),
      name_ru: weaponRu.name,
      name_en: weaponEn.name,
      weapon_type: weaponEn.weaponText,
      rarity: weaponEn.rarity,
      stats: buildWeaponStats(weaponEn, weaponRu),
      passive_name_ru: weaponRu.effectName || '',
      passive_description_ru: weaponRu.r1?.description || '',
      ascension_materials: buildWeaponAscensionMaterials(weaponEn, weaponRu),
      coordinates: [],
    };

    writeJson(path.join(WEAPONS_DIR, `${weapon.id}.json`), weapon);
    saved += 1;
    logProgress('Оружие', index + 1, names.length);
  });

  console.log(`Оружие сохранено: ${saved}`);
}

function syncCharacters() {
  console.log('Синхронизация персонажей...');
  const names = getNames('characters');
  let saved = 0;

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
      substat: {
        type: characterEn.substatType || '',
        name_ru: characterRu.substatText || characterEn.substatText || '',
        name_en: characterEn.substatText || '',
      },
      stats: buildCharacterStats(characterEn),
      talents: buildCharacterTalents(characterEn.name),
      passive_talents: buildPassiveTalents(characterEn.name),
      constellations: buildConstellations(characterEn.name),
      coordinates: [],
    };

    writeJson(path.join(CHARACTERS_DIR, `${character.id}.json`), character);
    saved += 1;
    logProgress('Персонажи', index + 1, names.length);
  });

  console.log(`Персонажи сохранены: ${saved}`);
}

function syncMaterials() {
  console.log('Синхронизация материалов...');
  const names = getNames('materials');
  let saved = 0;
  const materialIds = new Set();

  names.forEach((name, index) => {
    const materialEn = genshin.materials(name, EN);
    const materialRu = genshin.materials(name, RU);
    if (!materialEn || !materialRu) return;

    const material = {
      id: slugify(materialEn.name),
      name_ru: materialRu.name,
      name_en: materialEn.name,
      type: classifyMaterial(materialEn, materialRu),
      type_text_ru: materialRu.typeText || '',
      days_of_week_ru: asArray(materialRu.daysOfWeek),
      source_ru: getSources(materialRu),
      dropped_by: [],
      obtained_from_domains: [],
      source_domain: null,
      coordinates: [],
    };

    writeJson(path.join(MATERIALS_DIR, `${material.id}.json`), material);
    materialIds.add(material.id);
    saved += 1;
    logProgress('Материалы', index + 1, names.length);
  });

  console.log(`Материалы сохранены: ${saved}`);
  return materialIds;
}

function syncEnemies(materialIds) {
  console.log('Синхронизация врагов...');
  const names = getNames('enemies');
  const droppedBy = new Map();
  let saved = 0;

  names.forEach((name, index) => {
    const enemyEn = genshin.enemies(name, EN);
    const enemyRu = genshin.enemies(name, RU);
    if (!enemyEn || !enemyRu) return;

    const enemy = {
      id: slugify(enemyEn.name),
      name_ru: enemyRu.name,
      name_en: enemyEn.name,
      type: enemyEn.investigation?.categoryType || enemyEn.enemyType || enemyEn.monsterType || '',
      type_ru: enemyRu.investigation?.categoryText || enemyRu.categoryText || '',
      drops: buildEnemyDrops(enemyEn, materialIds),
      coordinates: [],
    };

    enemy.drops.forEach((materialId) => {
      if (!droppedBy.has(materialId)) droppedBy.set(materialId, []);
      droppedBy.get(materialId).push(enemy.id);
    });

    writeJson(path.join(ENEMIES_DIR, `${enemy.id}.json`), enemy);
    saved += 1;
    logProgress('Враги', index + 1, names.length);
  });

  updateMaterialDropMappings(droppedBy);
  console.log(`Враги сохранены: ${saved}`);
}

function syncDomains(materialIds, artifactIds) {
  console.log('Синхронизация подземелий...');
  const names = getNames('domains');
  const domainSources = new Map();
  let saved = 0;

  names.forEach((name, index) => {
    const domainEn = genshin.domains(name, EN);
    const domainRu = genshin.domains(name, RU);
    if (!domainEn || !domainRu) return;

    const domain = {
      id: slugify(domainEn.name),
      name_ru: domainRu.name,
      name_en: domainEn.name,
      type: domainRu.domainText || domainEn.domainText || '',
      region: domainRu.regionName || domainEn.regionName || '',
      days_of_week: asArray(domainRu.daysOfWeek),
      rewards: buildDomainRewards(domainEn, materialIds, artifactIds),
      coordinates: [],
    };

    domain.rewards.forEach((rewardId) => {
      if (!domainSources.has(rewardId)) domainSources.set(rewardId, []);
      domainSources.get(rewardId).push(domain.id);
    });

    writeJson(path.join(DOMAINS_DIR, `${domain.id}.json`), domain);
    saved += 1;
    logProgress('Подземелья', index + 1, names.length);
  });

  updateDomainSourceMappings(domainSources, materialIds, artifactIds);
  console.log(`Подземелья сохранены: ${saved}`);
}

function syncFood() {
  console.log('Синхронизация еды и рецептов...');
  const names = getNames('foods');
  let saved = 0;

  names.forEach((name, index) => {
    const foodEn = genshin.foods(name, EN);
    const foodRu = genshin.foods(name, RU);
    if (!foodEn || !foodRu) return;

    const food = {
      id: slugify(foodEn.name),
      name_ru: foodRu.name,
      name_en: foodEn.name,
      rarity: foodEn.rarity,
      food_type: foodRu.filterText || foodEn.filterText || foodEn.filterType || '',
      effect_ru: foodRu.delicious?.effect || foodRu.normal?.effect || foodRu.effect || '',
      recipe: buildIngredientRecipe(foodEn.ingredients),
      coordinates: [],
    };

    writeJson(path.join(FOOD_DIR, `${food.id}.json`), food);
    saved += 1;
    logProgress('Еда', index + 1, names.length);
  });

  console.log(`Еда и рецепты сохранены: ${saved}`);
}

function syncFishing() {
  console.log('Синхронизация рыбалки и наживок...');
  const baitItems = buildFishingBaits();
  const fishItems = buildFishItems(baitItems);
  const items = [...baitItems, ...fishItems];

  items.forEach((item) => {
    writeJson(path.join(FISHING_DIR, `${item.id}.json`), item);
  });

  console.log(`Рыбалка сохранена: ${items.length} объектов`);
}

function syncVersions() {
  console.log('Создание шаблона версии игры...');
  const current = {
    game_version: '5.x',
    patch_name: 'Название патча',
    release_date: 'YYYY-MM-DD',
    active_banners: {
      phase_1: ['character_1', 'character_2'],
      phase_2: ['character_3', 'character_4'],
    },
  };

  writeJson(path.join(VERSIONS_DIR, 'current.json'), current);
  console.log('Шаблон версии сохранен: knowledge_base/versions/current.json');
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
  const checkpoints = [
    { key: 'level_1_a0', label: 'Уровень 1 (A0)', level: 1, ascension: 0 },
    { key: 'level_20_a0', label: 'Уровень 20 (A0)', level: 20, ascension: 0 },
    { key: 'level_20_a1', label: 'Уровень 20+ (A1)', level: 20, ascension: 1 },
    { key: 'level_40_a2', label: 'Уровень 40+ (A2)', level: 40, ascension: 2 },
    { key: 'level_50_a3', label: 'Уровень 50+ (A3)', level: 50, ascension: 3 },
    { key: 'level_60_a4', label: 'Уровень 60+ (A4)', level: 60, ascension: 4 },
    { key: 'level_70_a5', label: 'Уровень 70+ (A5)', level: 70, ascension: 5 },
    { key: 'level_80_a6', label: 'Уровень 80+ (A6)', level: 80, ascension: 6 },
    { key: 'level_90_a6', label: 'Уровень 90 (A6)', level: 90, ascension: 6 },
  ];

  return {
    base_stats_constants: {
      crit_rate: 0.05,
      crit_dmg: 0.5,
      energy_recharge: 1.0,
    },
    progression: checkpoints.map((checkpoint) => buildCharacterProgressionPoint(characterEn, checkpoint)),
  };
}

function buildCharacterProgressionPoint(characterEn, checkpoint) {
  const stats = safeStats(characterEn, checkpoint.level, checkpoint.ascension);
  return {
    key: checkpoint.key,
    label: checkpoint.label,
    level: checkpoint.level,
    ascension: checkpoint.ascension,
    hp: roundStat(stats.hp),
    atk: roundStat(stats.attack),
    def: roundStat(stats.defense),
    ascension_bonus: roundStat(stats.specialized),
  };
}

function buildCharacterTalents(characterNameEn) {
  const talentsRu = genshin.talents(characterNameEn, RU);
  if (!talentsRu) return [];

  return Object.entries(COMBAT_TALENT_TYPES)
    .map(([key, type]) => {
      const talent = talentsRu?.[key];
      if (!talent) return null;
      return {
        type,
        name_ru: talent.name || '',
        description_ru: talent.description || '',
      };
    })
    .filter(Boolean);
}

function buildPassiveTalents(characterNameEn) {
  const talentsRu = genshin.talents(characterNameEn, RU);
  if (!talentsRu) return [];

  return Object.entries(PASSIVE_TALENT_TYPES)
    .map(([key, type]) => {
      const talent = talentsRu?.[key];
      if (!talent) return null;
      return {
        type,
        name_ru: talent.name || '',
        description_ru: talent.description || '',
      };
    })
    .filter(Boolean);
}

function buildConstellations(characterNameEn) {
  const constellationsRu = genshin.constellations(characterNameEn, RU);
  if (!constellationsRu) return [];

  return ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']
    .map((key) => {
      const constellation = constellationsRu?.[key];
      if (!constellation) return null;
      return {
        name_ru: constellation.name || '',
        description_ru: constellation.description || '',
      };
    })
    .filter(Boolean);
}

function buildEnemyDrops(enemyEn, materialIds) {
  const drops = [];
  asArray(enemyEn.rewardPreview).forEach((reward) => {
    const materialId = resolveRewardMaterialId(reward);
    if (materialId && materialIds.has(materialId) && !drops.includes(materialId)) {
      drops.push(materialId);
    }
  });
  return drops;
}

function buildDomainRewards(domainEn, materialIds, artifactIds) {
  const rewards = [];
  asArray(domainEn.rewardPreview).forEach((reward) => {
    const rewardId = resolveRewardEntityId(reward, materialIds, artifactIds);
    if (rewardId && !rewards.includes(rewardId)) {
      rewards.push(rewardId);
    }
  });
  return rewards;
}

function resolveRewardEntityId(reward, materialIds, artifactIds) {
  if (!reward?.name) return '';
  if (IGNORED_ENEMY_REWARD_NAMES.has(reward.name)) return '';

  const materialEn = genshin.materials(reward.name, EN);
  if (materialEn) {
    const materialId = slugify(materialEn.name);
    if (materialIds.has(materialId)) return materialId;
  }

  const artifactEn = genshin.artifacts(reward.name, EN);
  if (artifactEn) {
    const artifactId = slugify(artifactEn.name);
    if (artifactIds.has(artifactId)) return artifactId;
  }

  return '';
}

function resolveRewardMaterialId(reward) {
  if (!reward?.name) return '';
  if (IGNORED_ENEMY_REWARD_NAMES.has(reward.name)) return '';
  const materialEn = genshin.materials(reward.name, EN);
  if (!materialEn) return '';
  return slugify(materialEn.name);
}

function updateDomainSourceMappings(domainSources, materialIds, artifactIds) {
  domainSources.forEach((domainIds, entityId) => {
    const uniqueDomainIds = Array.from(new Set(domainIds)).sort();
    if (materialIds.has(entityId)) {
      updateJsonFile(path.join(MATERIALS_DIR, `${entityId}.json`), (material) => {
        material.obtained_from_domains = uniqueDomainIds;
        material.source_domain = uniqueDomainIds[0] || null;
        return material;
      });
    }
    if (artifactIds.has(entityId)) {
      updateJsonFile(path.join(ARTIFACTS_DIR, `${entityId}.json`), (artifact) => {
        artifact.source_domain = uniqueDomainIds[0] || null;
        return artifact;
      });
    }
  });
}

function updateMaterialDropMappings(droppedBy) {
  droppedBy.forEach((enemyIds, materialId) => {
    updateJsonFile(path.join(MATERIALS_DIR, `${materialId}.json`), (material) => {
      material.dropped_by = Array.from(new Set(enemyIds)).sort();
      return material;
    });
  });
}

function buildIngredientRecipe(ingredients) {
  return asArray(ingredients)
    .map((ingredient) => ({
      material_id: slugify(ingredient.name),
      count: ingredient.count || 0,
    }))
    .filter((ingredient) => ingredient.material_id);
}

function buildFishingBaits() {
  return getNames('materials')
    .map((name) => {
      const materialEn = genshin.materials(name, EN);
      const materialRu = genshin.materials(name, RU);
      if (!materialEn || !materialRu || materialEn.category !== 'FISH_BAIT') return null;

      const craftEn = genshin.crafts(materialEn.name, EN);
      return {
        id: slugify(materialEn.name),
        kind: 'bait',
        name_ru: materialRu.name,
        name_en: materialEn.name,
        recipe: buildIngredientRecipe(craftEn?.recipe),
        coordinates: [],
      };
    })
    .filter(Boolean);
}

function buildFishItems(baitItems) {
  const baitDescriptions = baitItems.map((bait) => {
    const materialEn = genshin.materials(bait.name_en, EN);
    return {
      bait_id: bait.id,
      description: String(materialEn?.description || '').toLowerCase(),
    };
  });

  return getNames('animals')
    .map((name) => {
      const animalEn = genshin.animals(name, EN);
      const animalRu = genshin.animals(name, RU);
      if (!animalEn || !animalRu || animalEn.categoryType !== 'SUBTYPE_FISH') return null;

      const materialRu = genshin.materials(animalEn.name, RU);
      const fishName = String(animalEn.name || '').toLowerCase();
      const bait = baitDescriptions.find((entry) => entry.description.includes(fishName));

      return {
        id: slugify(animalEn.name),
        kind: 'fish',
        name_ru: animalRu.name,
        name_en: animalEn.name,
        bait_id: bait?.bait_id || null,
        locations: getSources(materialRu),
        coordinates: [],
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

function getEntityIds(folder) {
  return new Set(
    getNames(folder)
      .map((name) => {
        const entity = genshin[folder](name, EN);
        return entity?.name ? slugify(entity.name) : '';
      })
      .filter(Boolean),
  );
}

function safeStats(entity, level, ascension = undefined) {
  if (typeof entity?.stats !== 'function') return {};
  try {
    return ascension === undefined ? entity.stats(level) || {} : entity.stats(level, ascension) || {};
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

function removeLegacyFiles() {
  [
    path.join(KB_DIR, 'artifacts.json'),
    path.join(KB_DIR, 'weapons.json'),
    path.join(KB_DIR, 'materials.json'),
    path.join(PROJECT_ROOT, 'version_info.md'),
  ].forEach((filePath) => {
    fs.rmSync(filePath, { force: true });
  });
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function updateJsonFile(filePath, updater) {
  if (!fs.existsSync(filePath)) return;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  writeJson(filePath, updater(data));
}

function getSources(entity) {
  return asArray(entity?.sources).length ? asArray(entity.sources) : asArray(entity?.source);
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
