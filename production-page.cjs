'use strict';
// Preserve the owner's original marketplace presentation on production.
module.exports=function(html){
 return html.replace('</head>','<link rel="canonical" href="https://novanoxx.com/"><script>window.NNX_PRODUCTION_SITE=true;</script></head>');
};
