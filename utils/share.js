const ENTRY_SHARE_PATHS = new Set([
  '/pages/home/index',
  '/pages/assistant/index',
  '/pages/guzi/index',
  '/pages/halloween/index',
  '/pages/pet-space/supplies',
  '/pages/pet-space/hunting',
]);

// Always use an explicit cover: automatic screenshots can contain private records.
export function shareCard(title, path, params = {}, image = '') {
  const [page, existingQuery = ''] = path.split('?');
  const hasItem = (params.id != null && params.id !== '') || /(?:^|&)id=[^&]+/.test(existingQuery);
  const isEntryShare = ENTRY_SHARE_PATHS.has(page) && !hasItem;
  const fallbackImage = isEntryShare
    ? '/static/design/share-cover.jpg'
    : '/static/design/home-hero.png';
  const query = Object.keys(params)
    .filter((key) => params[key] !== '' && params[key] != null)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  return {
    title: (isEntryShare ? '宠析 | 毛孩子的贴身管家' : title || '宠析 · 记录陪伴，分享生活').slice(0, 100),
    path: path + (query ? '?' + query : ''),
    imageUrl: /^https?:\/\//.test(image) ? image : fallbackImage,
  };
}

export function timelineCard(card) {
  return { title: card.title, query: card.path.split('?')[1] || '', imageUrl: card.imageUrl };
}

export function supplyShare(kind, item, path = '/pages/pet-space/supplies') {
  const params = { kind };
  if (item) {
    params.id = item.id;
    if (kind === 'food') params.q = [item.brand, item.name].filter(Boolean).join(' ');
  }
  return shareCard(
    item ? [item.brand, item.name].filter(Boolean).join(' · ') : kind === 'food' ? '发现适合爱宠的口粮' : '一起发现宠物创意好物',
    path,
    params,
    item && item.image,
  );
}
