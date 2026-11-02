"use strict";
/* Capa UX no destructiva: conserva presupuestos, herramientas y datos actuales. */
(() => {
 const states=["Pendiente","En medición","Presupuestado","En producción","Para instalar","Instalado","Finalizado"];
 const active=j=>!["Instalado","Finalizado"].includes(j.estado);
 const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")};
 const filters={estado:"",responsable:"",tipo:"",texto:""};
 const safe=window.vidresEscape||((v)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])));
 const options=(values,selected)=>'<option value="">Todos</option>'+values.map(v=>'<option '+(v===selected?"selected":"")+'>'+safe(v)+'</option>').join("");
 const jobCard=j=>'<article class="vs-job"><div class="vs-job-top"><strong>'+safe(j.cliente)+'</strong><span class="vs-status" data-status="'+safe(j.estado)+'">'+safe(j.estado)+'</span></div><p>'+safe(j.descripcion)+'</p><small>'+safe(j.id)+' · '+safe(j.fecha||"Sin fecha")+' · '+safe(j.responsable||"Sin asignar")+'</small><button type="button" class="vs-edit" data-id="'+safe(j.id)+'">Abrir trabajo</button></article>';
 const cards=items=>items.length?'<div class="vs-cards">'+items.map(jobCard).join("")+'</div>':'<div class="vs-empty">No hay trabajos en esta sección.</div>';
 function enhance(){
  const content=document.querySelector("#content");if(!content)return;
  const now=today();
  if(page==="inicio"&&homeView==="dashboard"){
   const todayJobs=jobs.filter(j=>active(j)&&j.fecha===now),late=jobs.filter(j=>active(j)&&j.fecha&&j.fecha<now),measure=jobs.filter(j=>j.estado==="En medición");
   const summary=states.map(s=>'<span>'+safe(s)+': <b>'+jobs.filter(j=>j.estado===s).length+'</b></span>').join("");
   content.innerHTML='<div class="vs-summary"><div class="vs-stat"><b>'+todayJobs.length+'</b>Hoy</div><div class="vs-stat vs-alert"><b>'+late.length+'</b>Atrasados</div><div class="vs-stat"><b>'+measure.length+'</b>En medición</div></div><section class="panel"><h2>Trabajos de hoy</h2>'+cards(todayJobs)+'</section><section class="panel"><h2>Trabajos atrasados</h2>'+cards(late)+'</section><section class="panel"><h2>Pendientes de medir</h2>'+cards(measure)+'</section><section class="panel"><h2>Resumen por estado</h2><div class="vs-state-summary">'+summary+'</div></section>';
  }
  if(page==="trabajos"){
   const people=[...new Set(jobs.map(j=>j.responsable).filter(Boolean))].sort();
   const types=[...new Set(jobs.map(j=>j.tipoCliente||"Particular"))].sort();
   const filtered=jobs.filter(j=>(!filters.estado||j.estado===filters.estado)&&(!filters.responsable||j.responsable===filters.responsable)&&(!filters.tipo||(j.tipoCliente||"Particular")===filters.tipo)&&(!filters.texto||[j.cliente,j.descripcion,j.id,j.direccion].join(" ").toLocaleLowerCase("es").includes(filters.texto.toLocaleLowerCase("es"))));
   content.innerHTML='<section class="panel"><h2>Buscar y filtrar</h2><div class="vs-filters"><label>Buscar<input id="vs-search" placeholder="Cliente, trabajo, referencia…" value="'+safe(filters.texto)+'"></label><label>Estado<select id="vs-state">'+options(states,filters.estado)+'</select></label><label>Responsable<select id="vs-person">'+options(people,filters.responsable)+'</select></label><label>Tipo de cliente<select id="vs-type">'+options(types,filters.tipo)+'</select></label></div><p class="muted">'+filtered.length+' trabajos encontrados</p></section>'+cards(filtered);
  }
  document.querySelectorAll(".vs-bottom [data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  document.querySelectorAll(".vs-more-links [data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
 }
 const originalRender=render;
 render=function(){originalRender();enhance()};
 const nav=document.createElement("nav");nav.className="vs-bottom";nav.setAttribute("aria-label","Accesos móviles");
 nav.innerHTML=[["inicio","⌂","Inicio"],["trabajos","▤","Trabajos"],["calendario","▦","Calendario"],["clientes","♙","Clientes"]].map(([p,i,t])=>'<button type="button" data-page="'+p+'"><span>'+i+'</span>'+t+'</button>').join("")+'<button type="button" id="vs-more"><span>☰</span>Más</button>';
 document.body.appendChild(nav);
 const more=document.createElement("dialog");more.id="vs-more-dialog";more.innerHTML='<div class="vs-more-head"><h2>Más secciones</h2><button type="button" id="vs-close">Cerrar</button></div><div class="vs-more-links">'+[["mediciones","Mediciones"],["herramientas","Herramientas"],["produccion","Producción"],["avisos","Avisos"],["presupuestos","Presupuestos"],["ajustes","Ajustes"]].map(([p,t])=>'<button type="button" data-page="'+p+'">'+t+'</button>').join("")+'</div>';document.body.appendChild(more);
 nav.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.id==="vs-more")more.showModal();else if(b.dataset.page)window.vidresNavigate(b.dataset.page)});
 more.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.id==="vs-close")more.close();else if(b.dataset.page){more.close();window.vidresNavigate(b.dataset.page)}});
 document.querySelector("#content").addEventListener("input",e=>{if(e.target.id==="vs-search"){filters.texto=e.target.value;const pos=e.target.selectionStart;enhance();const input=document.querySelector("#vs-search");input.focus();input.setSelectionRange(pos,pos)}});
 document.querySelector("#content").addEventListener("change",e=>{const k={"vs-state":"estado","vs-person":"responsable","vs-type":"tipo"}[e.target.id];if(k){filters[k]=e.target.value;enhance()}});
 const form=document.querySelector("#form"),client=form.elements.cliente;
 const datalist=document.createElement("datalist");datalist.id="vs-clients";document.body.appendChild(datalist);client.setAttribute("list","vs-clients");
 document.querySelector("#add").addEventListener("click",()=>{datalist.innerHTML=[...new Set(jobs.map(j=>j.cliente))].map(v=>'<option value="'+safe(v)+'"></option>').join("")});
 const originalSave=save;save=function(){try{originalSave()}catch(err){alert("No se pudo guardar. Comprueba el espacio disponible en el dispositivo.");throw err}};
 const theme=localStorage.getItem("vs-theme")||"light";
 document.documentElement.dataset.theme=theme;
 const themeButton=document.createElement("button");themeButton.type="button";themeButton.id="vs-theme";themeButton.textContent="Cambiar modo claro / oscuro";
 more.querySelector(".vs-more-links").appendChild(themeButton);
 themeButton.addEventListener("click",()=>{const next=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=next;localStorage.setItem("vs-theme",next);more.close()});
 enhance();
})();