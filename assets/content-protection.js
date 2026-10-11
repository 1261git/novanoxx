(()=>{
 const editable=target=>target instanceof Element&&Boolean(target.closest('input,textarea,[contenteditable=""],[contenteditable="true"]'));
 document.addEventListener('contextmenu',e=>{if(!editable(e.target))e.preventDefault()});
 document.addEventListener('dragstart',e=>{if(!editable(e.target))e.preventDefault()});
 document.addEventListener('selectstart',e=>{if(!editable(e.target))e.preventDefault()});
 document.addEventListener('copy',e=>{if(!editable(e.target))e.preventDefault()});
})();