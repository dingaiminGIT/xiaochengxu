// Custom tab bars live outside page stacking contexts. Hide them while a modal is open.
const modalKeys = [
  'showRecord',
  'showDevices',
  'showFoodSheet',
  'showSymptomSheet',
  'showIngredientSheet',
  'showExitModal',
  'showPetGate',
  'showChatPetPicker',
  'showDailyRecord',
];
export function hasOpenModal(data) {
  return modalKeys.some((key) => !!data[key]);
}
export function syncModalTabBar(page) {
  const tab = typeof page.getTabBar === 'function' && page.getTabBar();
  if (tab) tab.setData({ modalHidden: hasOpenModal(page.data) });
}
export function setModalData(page, patch, callback) {
  page.setData(patch, callback);
  syncModalTabBar(page);
}
