(function(root){
 'use strict';
 const controls=new WeakMap();let scheduled=false;
 function enhance(input){
  if(input.closest('[data-native-file-picker]'))return;
  let control=controls.get(input);
  if(!control){
   const wrapper=document.createElement('span'),button=document.createElement('button'),name=document.createElement('span');
   wrapper.className='localized-file-picker';button.type='button';button.className='localized-file-button';name.className='localized-file-name';name.setAttribute('aria-live','polite');
   input.before(wrapper);wrapper.append(input,button,name);input.classList.add('localized-file-native');input.tabIndex=-1;input.setAttribute('aria-hidden','true');
   button.onclick=event=>{event.preventDefault();event.stopPropagation();if(!input.matches(':disabled'))input.click();};
   // Keep the original input, FileList and upload handlers intact.
   control={button,name};controls.set(input,control);input.addEventListener('change',()=>refresh(input,control));
   input.addEventListener('focus',()=>button.focus());
   input.form?.addEventListener('reset',()=>queueMicrotask(()=>refresh(input,control)));
  }
  refresh(input,control);
 }
 function refresh(input,{button,name}){
  const disabled=input.matches(':disabled');if(button.disabled!==disabled)button.disabled=disabled;
  const buttonText=root.uiText('파일 선택');if(button.textContent!==buttonText)root.uiMessage(button,'파일 선택');
  const names=Array.from(input.files||[],file=>file.name),text=names.length?names.join(', '):root.uiText('선택된 파일 없음');
  if(names.length){name.removeAttribute('data-i18n');if(name.textContent!==text)name.textContent=text;}
  else if(name.textContent!==text||!name.hasAttribute('data-i18n'))root.uiMessage(name,'선택된 파일 없음');
 }
 function apply(){scheduled=false;document.querySelectorAll('input[type="file"]').forEach(enhance);}
 function schedule(){if(!scheduled){scheduled=true;queueMicrotask(apply);}}
 document.addEventListener('DOMContentLoaded',()=>{apply();new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','type']});});
 document.addEventListener('nnx-language-change',apply);
})(globalThis);
