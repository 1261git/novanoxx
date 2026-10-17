'use strict';
let occupied=false;
module.exports=()=>{if(occupied)throw Error('PREVIEW_BUSY');occupied=true;let released=false;return()=>{if(!released){released=true;occupied=false;}};};
