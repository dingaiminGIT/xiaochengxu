// Always use an explicit cover: automatic screenshots can contain private records.
export function shareCard(title, path, params = {}, image = '') {
  const query = Object.keys(params)
    .filter((key) => params[key] !== '' && params[key] != null)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  return {
    title: (title || '宠析 · 记录陪伴，分享生活').slice(0, 100),
    path: path + (query ? '?' + query : ''),
    imageUrl: /^https?:\/\//.test(image) ? image : '/static/design/home-hero.png',
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
