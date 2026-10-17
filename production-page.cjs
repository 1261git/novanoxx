'use strict';
// Keep the original prototype source intact; never publish fixture products on production.
module.exports=function(html){
 for(const name of ['featured-collection','monthly-awards'])html=html.replace(new RegExp('<section class="'+name+'"[\\s\\S]*?</section>'),'<section class="'+name+'" hidden></section>');
 html=html.replace(/const assets=\[[\s\S]*?\r?\n\];/,'const assets=[];');
 html=html.replace(/<div class="note"[^>]*>홈 화면 시안[\s\S]*?<\/div>/,'');
 return html.replace('</head>','<link rel="canonical" href="https://novanoxx.com/"><script>window.NNX_PRODUCTION_SITE=true;</script></head>');
};
