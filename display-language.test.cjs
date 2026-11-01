'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const ui=require('./assets/ui-language.js'),titles=require('./assets/asset-title-translations.js');
test('known published titles switch in all six languages without changing source or unknown content',()=>{
 const original=JSON.stringify(titles);for(const [source,translations]of Object.entries(titles))for(const {code}of ui.languages){assert.equal(ui.assetTitle(source,code),translations[code]);assert.ok(translations[code]);}
 const unknown='새 작가의 <script>작품 & original';for(const {code}of ui.languages)assert.equal(ui.assetTitle(unknown,code),unknown);assert.equal(JSON.stringify(titles),original);
});
test('dates follow selected locale including AM/PM, midnight, and missing values',()=>{
 const stamp='2026-11-01T08:02:12Z',options={timeZone:'Asia/Seoul'};
 for(const {code,locale}of ui.languages)assert.equal(ui.formatDate(stamp,code,options),new Date(stamp).toLocaleString(locale,options));
 assert.match(ui.formatDate(stamp,'en',options),/PM/);assert.doesNotMatch(ui.formatDate(stamp,'en',options),/오전|오후/);assert.match(ui.formatDate('2026-10-31T15:00:00Z','en',options),/AM/);
 for(const v of [null,undefined,'','invalid'])assert.equal(ui.formatDate(v,'en'),'');
});
test('existing title and date nodes update across repeated language changes',()=>{
 const source=Object.keys(titles)[0];const attrs={'data-asset-title':source},node={textContent:source,getAttribute:k=>attrs[k]??null};
 for(const {code}of [...ui.languages,...ui.languages].reverse()){ui.localizeDisplay(node,code);assert.equal(node.textContent,titles[source][code]);assert.equal(attrs['data-asset-title'],source);}
 const date={'data-localized-datetime':'2026-11-01T08:02:12.000Z'},n={textContent:'',getAttribute:k=>date[k]??null};for(const {code}of ui.languages){ui.localizeDisplay(n,code);assert.equal(n.textContent,ui.formatDate(date['data-localized-datetime'],code));}
});
test('all category menu headings and view-all labels carry translation sources',()=>{
 const menu=fs.readFileSync('assets/market-menu.js','utf8');assert.match(menu,/data-i18n="\$\{esc\(label\)\}" data-i18n-category/);assert.match(menu,/uiMarkup\('전체 \{category\} 보기'/);
 for(const {code}of ui.languages.filter(l=>l.code!=='ko'))for(const key of ['영상','오디오','문서','AI 도구','전체 {category} 보기'])assert.notEqual(ui.translate(key,code),key);
});
test('view-all category labels update repeatedly without retaining the previous language',()=>{
 const attrs={'data-i18n':'전체 {category} 보기','data-i18n-values':JSON.stringify({category:'영상'})};const el={textContent:'전체 영상 보기',closest:()=>null,getAttribute:k=>attrs[k]??null};
 for(const {code}of [...ui.languages,...ui.languages].reverse()){ui.localizeElement(el,code);assert.equal(el.textContent,ui.translate('전체 {category} 보기',code).replace('{category}',ui.translate('영상',code)));}
});
test('title HTML escapes unknown creator text and leaves form title values unmarked',()=>{
 const vm=require('node:vm'),context={NNX_TRANSLATIONS:require('./assets/ui-translations.js'),NNX_TRANSLATIONS_EXTRA:require('./assets/ui-translations-extra.js'),NNX_ASSET_TITLE_TRANSLATIONS:titles,localStorage:{getItem:()=> 'en'},document:{addEventListener(){}},addEventListener(){}};context.window=context;
 vm.runInNewContext(fs.readFileSync('assets/ui-language.js','utf8'),context);
 assert.equal(context.uiAssetTitleMarkup('<img src=x onerror="bad()">'),'<span data-asset-title="&lt;img src=x onerror=&quot;bad()&quot;&gt;">&lt;img src=x onerror=&quot;bad()&quot;&gt;</span>');
 const workspace=fs.readFileSync('assets/creator-workspace.js','utf8');assert.match(workspace,/name="title" required maxlength="120" value="\$\{esc\(a.title\)\}"/);assert.doesNotMatch(workspace,/name="title"[^>]*uiAssetTitle/);
});
