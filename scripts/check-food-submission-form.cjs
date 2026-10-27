const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let definition,
  sent = 0,
  toast,
  scroll,
  back = 0,
  account = 'one',
  response;
const context = {
  Page: (d) => {
    definition = d;
  },
  requireSession: () => true,
  accountKey: () => account,
  getCurrentPages: () => [{}, {}],
  submissionView: (item) => item,
  submitFood: async () => {
    sent++;
    return response;
  },
  errorText: (e) => e.message,
  wx: {
    showToast: (o) => {
      toast = o;
    },
    pageScrollTo: (o) => {
      scroll = o;
    },
    navigateBack: (o) => {
      back++;
      if (o && o.success) o.success();
    },
  },
};
vm.runInNewContext(
  fs.readFileSync('pages/pet-space/food-submissions.js', 'utf8').replace(/^import .*;$/gm, ''),
  context,
);
function page() {
  return {
    ...definition,
    _active: true,
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) {
      for (const [path, value] of Object.entries(patch)) {
        const keys = path.split('.');
        let target = this.data;
        for (const key of keys.slice(0, -1)) target = target[key];
        target[keys[keys.length - 1]] = value;
      }
    },
  };
}
(async () => {
  const p = page();
  await p.submit();
  assert.equal(sent, 0);
  assert.equal(p.data.invalid.brand, true);
  assert.equal(p.data.invalid.product, true);
  assert.equal(p.data.invalid.images, true);
  assert.equal(scroll.selector, '#field-brand');
  assert.match(toast.title, /品牌和系列/);
  p.input({ currentTarget: { dataset: { key: 'brand' } }, detail: { value: '卫仕' } });
  assert.equal(p.data.invalid.brand, false);
  assert.equal(p.data.invalid.product, true);
  p.data.form.product = '  ';
  await p.submit();
  assert.equal(sent, 0);
  assert.equal(scroll.selector, '#field-product');
  p.data.form.product = 'LA20';
  await p.submit();
  assert.equal(scroll.selector, '#field-images');
  p.data.form.images = ['local.png'];
  response = Promise.reject(new Error('网络异常'));
  await p.submit();
  assert.equal(toast.title, '网络异常');
  assert.equal(p.data.form.product, 'LA20');
  assert.equal(p.data.saving, false);
  let resolve;
  response = new Promise((r) => {
    resolve = r;
  });
  const pending = p.submit();
  const before = sent;
  await p.submit();
  assert.equal(sent, before, 'block duplicate requests');
  resolve({ id: 'new' });
  await pending;
  assert.equal(p.data.selected, null);
  assert.equal(p.data.creating, false);
  assert.equal(p.data.items[0].id, 'new');
  assert.equal(back, 0, 'inline form returns to its own list');
  assert.equal(toast.title, '投稿成功');
  const direct = page();
  direct._directCreate = true;
  direct.data.form = { brand: '卫仕', product: 'LA20', images: ['local.png'] };
  response = { id: 'direct' };
  await direct.submit();
  assert.equal(back, 1, 'direct entry returns to its opener');
  const stale = page();
  stale.data.form = { brand: '卫仕', product: 'LA20', images: ['local.png'] };
  response = new Promise((r) => {
    resolve = r;
  });
  const request = stale.submit();
  account = 'two';
  resolve({ id: 'other-user' });
  await request;
  assert.equal(stale.data.items.length, 0);
  assert.equal(back, 1, 'stale account response cannot navigate');
  console.log(
    'PASS: missing-field feedback, highlight clearing, photo validation, failure retention, duplicate prevention, return navigation, account isolation',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
