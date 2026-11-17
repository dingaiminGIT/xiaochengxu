export function fitPhoto(width, height, size) {
  const ratio = Math.max(size / width, size / height);
  const w = width * ratio;
  const h = height * ratio;
  return { width: w, height: h, x: (size - w) / 2, y: (size - h) / 2, scale: 1 };
}

export function clampPhoto(photo, size) {
  return { ...photo, x: Math.min(0, Math.max(size - photo.width, photo.x)), y: Math.min(0, Math.max(size - photo.height, photo.y)) };
}

export function zoomPhoto(photo, nextScale, center, size) {
  const scale = Math.max(1, Math.min(4, nextScale));
  const ratio = scale / photo.scale;
  return clampPhoto({
    scale, width: photo.width * ratio, height: photo.height * ratio,
    x: center.x - (center.x - photo.x) * ratio,
    y: center.y - (center.y - photo.y) * ratio,
  }, size);
}

export function sourceRect(photo, originalWidth, size) {
  const ratio = originalWidth / photo.width;
  return { x: -photo.x * ratio, y: -photo.y * ratio, size: size * ratio };
}
