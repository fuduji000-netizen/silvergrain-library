import { filmStatuses, type FilmBrand, type FilmFile } from './types';

const productAliases: Record<string, string> = {
  fujichrome_provia_100f_rdp3: '富士 RDP3',
  fujichrome_velvia_100_rvp100: '富士 RVP100',
  fujichrome_velvia_50_rvp50: '富士 RVP50',
  fujicolor_100_c100: '富士 C100',
  fujifilm_200_new_c200: '富士 C200',
  fujifilm_400_c400: '富士 C400',
  fujifilm_acros_ii_135: '富士 ACROS II（135）',
  kodak_ektachrome_e100_e4000: '柯达 Ektachrome E100',
  kodak_ektar_100_e4046: '柯达 Ektar 100',
  kodak_ektar_100_e4046_zh_cn: '柯达 Ektar 100 中文版',
  kodak_gold_200_e7022: '柯达 Gold 200',
  kodak_portra_160_e4051: '柯达 Portra 160',
  kodak_portra_400_e4050: '柯达 Portra 400',
  kodak_portra_800_e4040: '柯达 Portra 800',
  kodak_tmax_100_f4016: '柯达 T-MAX 100',
  kodak_tmax_400_f4043: '柯达 T-MAX 400',
  kodak_trix_400_f4017: '柯达 Tri-X 400',
  kodak_vision3_50d_5203_7203: '柯达 VISION3 50D',
  kodak_vision3_200t_5213_7213: '柯达 VISION3 200T',
  kodak_vision3_250d_5207_7207: '柯达 VISION3 250D',
  kodak_vision3_500t_5219_7219: '柯达 VISION3 500T',
  kodak_ektachrome_100d_5294_7294: '柯达 Ektachrome 100D',
  kodak_ultramax_400_e7023: '柯达 UltraMax 400',
  ilford_hp5_plus: '伊尔福 HP5 PLUS',
  ilford_fp4_plus: '伊尔福 FP4 PLUS',
  ilford_delta_100: '伊尔福 DELTA 100',
  ilford_delta_400: '伊尔福 DELTA 400',
  ilford_delta_3200: '伊尔福 DELTA 3200',
  fomapan_100_classic: 'Foma Fomapan 100 Classic',
  fomapan_200_creative: 'Foma Fomapan 200 Creative',
  fomapan_400_action: 'Foma Fomapan 400 Action',
};

const brandPrefixes: Record<string, string[]> = {
  '富士': ['fujichrome_', 'fujicolor_', 'fujifilm_', 'neopan_'],
  '柯达': ['kodak_'],
  '伊尔福': ['ilford_', 'kentmere_'],
  '福马': ['fomapan_', 'foma_', 'retropan_'],
  '爱克发': ['agfaphoto_', 'agfapan_', 'agfa_'],
  '柯尼卡': ['konica_'],
};

const wordAliases: Record<string, string> = {
  ektachrome: 'Ektachrome', ektar: 'Ektar', portra: 'Portra', ultramax: 'UltraMax', ultra: 'Ultra',
  tmax: 'T-MAX', trix: 'Tri-X', tri: 'Tri', gold: 'Gold', pro: 'Pro', image: 'Image',
  vision: 'VISION', natura: 'Natura', acros: 'ACROS', provia: 'PROVIA', velvia: 'VELVIA',
  superia: 'SUPERIA', sensia: 'SENSIA', astia: 'ASTIA', neopan: 'NEOPAN', delta: 'DELTA',
  pan: 'PAN', hp5: 'HP5', fp4: 'FP4', sfx: 'SFX', ortho: 'ORTHO', xp2: 'XP2',
  fomapan: 'Fomapan', retropan: 'Retropan', phoenix: 'Phoenix', scala: 'Scala', apx: 'APX',
  aviphot: 'Aviphot', centuria: 'Centuria', chrome: 'Chrome', vx: 'VX', impresa: 'Impresa',
};

function normalizeFileName(fileName: string) {
  return fileName.replace(/\.pdf$/i, '').replace(/[()]/g, '').toLocaleLowerCase();
}

export function filmTitle(brand: string, file: FilmFile) {
  const normalized = normalizeFileName(file.fileName);
  const direct = productAliases[normalized];
  if (direct) return direct;

  const chineseBase = file.fileName.replace(/\.pdf$/i, '').replace(/\s*\(\d+\)$/g, '');
  if (/[\u3400-\u9fff]/.test(chineseBase)) return chineseBase.replace(/[《》]/g, '');

  // Film formats are part of the product identity, not import metadata.
  let model = normalized.replace(/_(zh-cn|third_party|single_use|internal|datasheet|first_generation|new)(?=_|$)/g, ' ');
  model = model.replace(/_(e\d+|f\d+|g\d+[a-z]?|[a-z]{1,3}\d{2,})\b/g, ' ');
  for (const prefix of brandPrefixes[brand] ?? []) model = model.replace(prefix, '');
  model = model.replaceAll('_', ' ').replace(/\s+/g, ' ').trim();
  model = model.split(' ').map((word) => wordAliases[word.toLowerCase()] ?? (/^\d/.test(word) ? word.toUpperCase() : word)).join(' ');

  const brandName = brand === '福马' ? 'Foma' : brand;
  return `${brandName} ${model}`.trim();
}

export function brandPreviewFiles(brand: FilmBrand) {
  const files = [...brand.staticFilms, ...brand.movieFilms].sort((left, right) => {
    const statusOrder = filmStatuses.indexOf(left.status) - filmStatuses.indexOf(right.status);
    return statusOrder || filmTitle(brand.name, left).localeCompare(filmTitle(brand.name, right), 'zh-CN');
  });
  const previews: FilmFile[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const identity = normalizeFileName(file.fileName).replace(/_(zh-cn|termfix_latest|single_use|internal|datasheet)/g, '');
    if (seen.has(identity)) continue;
    previews.push(file);
    seen.add(identity);
    if (previews.length === 3) break;
  }
  return previews;
}
