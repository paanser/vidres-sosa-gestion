"use strict";
(() => {
  const dialog=document.querySelector("#expediente");
  if(!dialog)return;
  const body=dialog.querySelector("#exp-body"),heading=dialog.querySelector("#exp-title");
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let current=null,tab="resumen";
  const photoDB=()=>new Promise((resolve,reject)=>{const request=indexedDB.open("vidres-fotos-v1",1);request.onupgradeneeded=()=>request.result.createObjectStore("fotos",{keyPath:"id"});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  async function photos(){const db=await photoDB();return new Promise((resolve,reject)=>{const tx=db.transaction("fotos","readonly");const r=tx.objectStore("fotos").getAll();r.onsuccess=()=>{resolve(r.result.filter(p=>p.trabajo===current));db.close();};r.onerror=()=>{reject(r.error);db.close();};});}
  async function savePhoto(record){const db=await photoDB();return new Promise((resolve,reject)=>{const tx=db.transaction("fotos","readwrite");tx.objectStore("fotos").put(record);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
  async function removePhoto(id){const db=await photoDB();return new Promise((resolve,reject)=>{const tx=db.transaction("fotos","readwrite");tx.objectStore("fotos").delete(id);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
  function compress(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);const scale=Math.min(1,1600/Math.max(img.width,img.height)),canvas=document.createElement("canvas");canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);canvas.toBlob(b=>b?resolve(b):reject(Error("No se pudo comprimir la imagen")),"image/jpeg",.72);};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error("Imagen no válida"));};img.src=url;});}
  const getJob=()=>window.vidresGetJobs?.().find(j=>j.id===current);
  const date=v=>v?new Date(v).toLocaleString("es-ES"):"—";
  async function render(){
    const j=getJob();if(!j){dialog.close();return;}
    heading.textContent=j.cliente+" · "+j.id;
    dialog.querySelectorAll("[data-exp-tab]").forEach(b=>{b.classList.toggle("selected",b.dataset.expTab===tab);b.setAttribute("aria-selected",String(b.dataset.expTab===tab));});
    const measures=(window.vidresGetMeasurements?.()||[]).filter(m=>m.trabajo===current);
    const detail='<div class="exp-details"><div><small>Estado</small><strong>'+esc(j.estado)+'</strong></div><div><small>Responsable</small><strong>'+esc(j.responsable||"Sin asignar")+'</strong></div><div><small>Fecha prevista</small><strong>'+esc(j.fecha||"Sin fecha")+'</strong></div><div><small>Tipo de cliente</small><strong>'+esc(j.tipoCliente||"Particular")+'</strong></div></div>';
    if(tab==="resumen")body.innerHTML=detail+'<div class="exp-two"><section class="exp-section"><h3>Descripción del trabajo</h3><p>'+esc(j.descripcion)+'</p><h3>Dirección</h3><p>'+esc(j.direccion||"No indicada")+'</p>'+(j.direccion?'<a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(j.direccion)+'">Abrir en mapas</a>':'')+'</section><section class="exp-section"><h3>Notas</h3><p>'+esc(j.notas||"Sin notas")+'</p><h3>Resumen</h3><p>'+measures.length+' piezas medidas · '+(Array.isArray(j.historial)?j.historial.length:0)+' movimientos registrados</p></section></div>';
    if(tab==="medidas")body.innerHTML='<div class="exp-section"><div class="exp-section-head"><h3>Mediciones del expediente</h3><button class="primary" data-exp-add-measure>+ Añadir medida</button></div>'+(measures.length?'<div class="exp-measure-grid">'+measures.map(m=>'<article><strong>'+esc(m.tipo)+'</strong><p>'+esc(m.ancho)+' × '+esc(m.alto)+' cm · '+esc(m.cantidad)+' ud.</p><p>'+((Number(m.ancho)*Number(m.alto)*Number(m.cantidad))/10000).toFixed(4)+' m² reales</p><button data-exp-measure="'+esc(m.id)+'">Editar medida</button></article>').join("")+'</div>':'<p>Todavía no hay piezas medidas.</p>')+'</div>';
    if(tab==="fotos"){body.innerHTML='<div class="exp-section"><div class="exp-section-head"><h3>Fotografías del trabajo</h3><label class="exp-upload">+ Añadir fotos<input id="exp-files" type="file" accept="image/*" multiple hidden></label></div><p class="muted">Las imágenes se comprimen antes de guardarse. Por ahora solo se conservan en este dispositivo y no se incluyen en la copia JSON.</p><div id="exp-photos" class="exp-gallery">Cargando fotos…</div></div>';try{const items=await photos();if(tab!=="fotos")return;const host=dialog.querySelector("#exp-photos");if(host)host.innerHTML=items.length?items.map(p=>'<figure><img src="'+URL.createObjectURL(p.blob)+'" alt="'+esc(p.nombre)+'"><figcaption>'+esc(p.nombre)+'</figcaption><button data-exp-delete-photo="'+esc(p.id)+'">Eliminar</button></figure>').join(""):'<p>No hay fotos adjuntas.</p>';}catch{const host=dialog.querySelector("#exp-photos");if(host)host.textContent="No se pudo acceder al almacenamiento de fotografías.";} }
    if(tab==="historial")body.innerHTML='<section class="exp-section"><h3>Historial de estados</h3>'+(Array.isArray(j.historial)&&j.historial.length?'<ol class="exp-history">'+j.historial.slice().reverse().map(h=>'<li><strong>'+esc(h.de||"Nuevo")+' → '+esc(h.a)+'</strong><span>'+esc(date(h.fecha))+' · '+esc(h.responsable||"Sin indicar")+'</span></li>').join("")+'</ol>':'<p>Este trabajo todavía no tiene cambios de estado registrados.</p>')+'</section>';
  }
  function open(id){current=id;tab="resumen";render();dialog.showModal();}
  document.querySelector("#content").addEventListener("click",e=>{const b=e.target.closest("[data-id]");if(b&&window.vidresGetJobs?.().some(j=>j.id===b.dataset.id)){e.stopImmediatePropagation();open(b.dataset.id);}},true);
  dialog.addEventListener("click",async e=>{
    const b=e.target.closest("button");if(!b)return;
    if(b.dataset.expTab){tab=b.dataset.expTab;await render();}
    else if(b.hasAttribute("data-exp-edit")){dialog.close();window.vidresOpenJobEditor?.(current);}
    else if(b.hasAttribute("data-exp-add-measure")){dialog.close();window.vidresOpenMeasurement?.(null);}
    else if(b.dataset.expMeasure){dialog.close();window.vidresOpenMeasurement?.(b.dataset.expMeasure);}
    else if(b.dataset.expDeletePhoto){if(!confirm("¿Eliminar esta fotografía?"))return;await removePhoto(b.dataset.expDeletePhoto);render();}
    else if(b.hasAttribute("data-exp-close"))dialog.close();
  });
  dialog.addEventListener("change",async e=>{if(e.target.id!=="exp-files")return;const files=[...e.target.files];if(files.length>12){alert("Añade un máximo de 12 fotos por operación.");return;}for(const file of files){if(!file.type.startsWith("image/")||file.size>20_000_000){alert("Archivo no admitido: "+file.name);continue;}try{const blob=await compress(file);await savePhoto({id:crypto.randomUUID(),trabajo:current,nombre:file.name.slice(0,100),blob,fecha:new Date().toISOString()});}catch(err){alert("No se pudo guardar "+file.name+": "+err.message);}}render();});
})();
