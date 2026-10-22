'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),categories=require('./assets/drama-categories.js');
test('two-level NovaPlay filters distinguish parent genres and preserve unclassified legacy titles',()=>{
 const legacy={genre:'OLD_CUSTOM_GENRE'},romance={category:'drama',subcategory:'romance-fantasy'},film={category:'film',subcategory:'romance'};
 assert.equal(categories.valid('drama','romance-fantasy'),true);assert.equal(categories.valid('drama','modern'),true);
 assert.equal(categories.valid('film','modern'),false);assert.equal(categories.valid('unknown','romance'),false);
 const rows=[legacy,romance,film];assert.equal(rows.filter(row=>categories.matches(row)).length,3);
 assert.deepEqual(rows.filter(row=>categories.matches(row,'drama','romance-fantasy')),[romance]);
 assert.deepEqual(rows.filter(row=>categories.matches(row,'film')),[film]);assert.deepEqual(rows.filter(row=>categories.matches(row,'unclassified')),[legacy]);
 assert.equal(legacy.genre,'OLD_CUSTOM_GENRE');assert.ok(Object.isFrozen(categories.groups[0].children));
});
test('category labels have translations in all supported secondary locales',()=>{
 const en=require('./assets/ui-translations.js'),extra=require('./assets/ui-translations-extra.js');
 const labels=new Set(categories.groups.flatMap(group=>[group.label,...group.children.map(child=>child.label)]));
 for(const dict of [en,extra.es,extra['zh-Hans'],extra.vi,extra.de])for(const label of labels)assert.ok(dict[label],label);
});
